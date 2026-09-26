"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActionRun, api, apiJson, Delivery, Me, UnauthorizedError } from "@/lib/api";

const STATUS_STYLES: Record<Delivery["status"], string> = {
  RECEIVED: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  QUEUED: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  PROCESSING: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  PROCESSED: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  FAILED: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  IGNORED: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400",
};

const ACTION_LABELS: Record<ActionRun["type"], string> = {
  ADD_LABEL: "Label",
  COMMENT: "Comment",
  SLACK: "Slack",
  AI_TRIAGE: "AI triage",
};

export default function ActivityPage() {
  const [filter, setFilter] = useState<"all" | "FAILED">("all");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const deliveries = useQuery({
    queryKey: ["deliveries", filter],
    queryFn: () => api<Delivery[]>(filter === "all" ? "/deliveries" : `/deliveries?status=${filter}`),
    refetchInterval: 3000, // live log
  });

  return (
    <main className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Connected repositories</h2>
          <a href="/api/auth/github/install" className="text-sm font-medium text-blue-600 hover:underline">
            + Connect repositories
          </a>
        </div>
        {me.isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : me.data?.repositories.length ? (
          <ul className="flex flex-wrap gap-2">
            {me.data.repositories.map((r) => (
              <li key={r.id} className="rounded-md border border-neutral-200 px-3 py-1 text-sm dark:border-neutral-800">
                {r.fullName}
                {r.private && <span className="ml-2 text-xs text-neutral-500">private</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">
            No repositories yet. Use “Connect repositories” to install the app on one.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="font-medium">Activity</h2>
            <div className="flex rounded-md border border-neutral-200 text-xs dark:border-neutral-800">
              {(["all", "FAILED"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 ${filter === f ? "bg-neutral-100 font-medium dark:bg-neutral-800" : "text-neutral-500"}`}
                >
                  {f === "all" ? "All" : "Failed"}
                </button>
              ))}
            </div>
          </div>
          <span className="text-xs text-neutral-500">{deliveries.isFetching ? "refreshing…" : "live · every 3s"}</span>
        </div>
        {deliveries.error && !(deliveries.error instanceof UnauthorizedError) && (
          <p role="alert" className="text-sm text-red-600">Could not load activity. Retrying…</p>
        )}
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Bot actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {deliveries.data?.length ? (
                deliveries.data.map((d) => <DeliveryRow key={d.id} d={d} />)
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    {deliveries.isLoading
                      ? "Loading…"
                      : filter === "FAILED"
                        ? "No failed deliveries."
                        : "No events yet. Open an issue on a connected repository."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function DeliveryRow({ d }: { d: Delivery }) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => apiJson(`/deliveries/${d.id}/retry`, "POST"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["deliveries"] }),
  });

  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{new Date(d.receivedAt).toLocaleString()}</td>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
        {d.event}
        {d.action ? `.${d.action}` : ""}
      </td>
      <td className="px-3 py-2">
        <div className="text-xs text-neutral-500">
          {d.repository}
          {d.sender ? ` · ${d.sender}` : ""}
        </div>
        {d.summary.url ? (
          <a href={d.summary.url} target="_blank" rel="noreferrer" className="hover:underline">
            {d.summary.number ? `#${d.summary.number} ` : ""}
            {d.summary.title}
          </a>
        ) : (
          d.summary.title
        )}
        {d.lastError && <div className="mt-1 text-xs text-red-600">{d.lastError}</div>}
      </td>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status]}`}>{d.status}</span>
        {d.attempts > 1 && <div className="mt-1 text-xs text-neutral-500">{d.attempts} attempts</div>}
        {d.status === "FAILED" && (
          <button
            onClick={() => retry.mutate()}
            disabled={retry.isPending}
            className="mt-1 block text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
          >
            {retry.isPending ? "Queuing…" : "Retry"}
          </button>
        )}
        {retry.error && <div className="mt-1 text-xs text-red-600">{(retry.error as Error).message}</div>}
      </td>
      <td className="px-3 py-2 text-xs">
        {d.actions.length ? (
          <ul className="space-y-1">
            {d.actions.map((a) => (
              <ActionItem key={a.id} a={a} />
            ))}
          </ul>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
    </tr>
  );
}

function ActionItem({ a }: { a: ActionRun }) {
  const result = (a.result ?? {}) as { url?: string; label?: string; target?: string; reason?: string };
  const retrying = a.status === "PENDING" && a.lastError;
  const tone =
    a.status === "SUCCEEDED" ? "text-green-700 dark:text-green-400" : a.status === "FAILED" ? "text-red-600" : "text-neutral-500";

  return (
    <li>
      <span className="font-medium">{ACTION_LABELS[a.type]}</span>{" "}
      <span className={tone}>{retrying ? `retrying (attempt ${a.attempts})` : a.status.toLowerCase()}</span>
      {result.label && <span className="text-neutral-500"> · {result.label}</span>}
      {result.target && <span className="text-neutral-500"> · {result.target}</span>}
      {result.url && (
        <>
          {" · "}
          <a href={result.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            view
          </a>
        </>
      )}
      {result.reason && <div className="text-neutral-500">{result.reason}</div>}
      {a.lastError && <div className="text-red-600">{a.lastError}</div>}
    </li>
  );
}
