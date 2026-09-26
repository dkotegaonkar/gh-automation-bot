"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api, apiJson, SlackTarget } from "@/lib/api";

const input =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700";

export default function SettingsPage() {
  const qc = useQueryClient();
  const targets = useQuery({ queryKey: ["slack-targets"], queryFn: () => api<SlackTarget[]>("/slack-targets") });
  const [name, setName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["slack-targets"] });
  const create = useMutation({
    mutationFn: () => apiJson<SlackTarget>("/slack-targets", "POST", { name, webhookUrl }),
    onSuccess: () => {
      setName("");
      setWebhookUrl("");
      setNotice("Saved. The URL is stored encrypted and is never shown again.");
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => apiJson(`/slack-targets/${id}`, "DELETE"), onSuccess: refresh });
  const test = useMutation({
    mutationFn: (id: string) => apiJson(`/slack-targets/${id}/test`, "POST"),
    onSuccess: () => setNotice("Test message sent. Check your Slack channel."),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    create.mutate();
  }

  const error = create.error ?? remove.error ?? test.error;

  return (
    <main className="max-w-2xl space-y-6">
      <section className="space-y-3">
        <h2 className="font-medium">Slack destinations</h2>
        <p className="text-sm text-neutral-500">
          Create an Incoming Webhook in your Slack app (Features → Incoming Webhooks) and paste its URL here. Rules with a
          “Send Slack alert” action post to the destination you pick, or to the first one if none is picked.
        </p>

        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {targets.data?.length ? (
            targets.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="font-mono text-xs text-neutral-500">{t.hint}</div>
                </div>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => test.mutate(t.id)} className="text-blue-600 hover:underline">
                    Send test
                  </button>
                  <button
                    onClick={() => confirm(`Delete “${t.name}”?`) && remove.mutate(t.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-sm text-neutral-500">{targets.isLoading ? "Loading…" : "No destinations yet."}</li>
          )}
        </ul>

        <form onSubmit={submit} className="space-y-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input className={input} placeholder="Name, e.g. #alerts" value={name} onChange={(e) => setName(e.target.value)} required />
            <input
              className={input}
              placeholder="https://hooks.slack.com/services/…"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              type="password"
              autoComplete="off"
              required
            />
          </div>
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {create.isPending ? "Saving…" : "Add destination"}
          </button>
        </form>

        {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {(error as Error).message}
          </p>
        )}
      </section>
    </main>
  );
}
