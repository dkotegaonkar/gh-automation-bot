"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, apiJson, Me, Rule, RuleInput, SlackTarget } from "@/lib/api";
import { RuleForm } from "./rule-form";

const CONDITION_LABELS: Record<keyof RuleInput["conditions"], string> = {
  titleContains: "title contains",
  bodyContains: "body contains",
  authors: "author is",
  labels: "has label",
  branches: "branch is",
};

export default function RulesPage() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: ["rules"], queryFn: () => api<Rule[]>("/rules") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/me") });
  const targets = useQuery({ queryKey: ["slack-targets"], queryFn: () => api<SlackTarget[]>("/slack-targets") });
  const [editing, setEditing] = useState<Rule | "new" | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["rules"] });
  const save = useMutation({
    mutationFn: (input: RuleInput) =>
      editing && editing !== "new" ? apiJson(`/rules/${editing.id}`, "PUT", input) : apiJson("/rules", "POST", input),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: (r: Rule) => apiJson(`/rules/${r.id}`, "PUT", { ...toInput(r), enabled: !r.enabled }),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: string) => apiJson(`/rules/${id}`, "DELETE"), onSuccess: refresh });

  const targetName = (id?: string) => targets.data?.find((t) => t.id === id)?.name ?? targets.data?.[0]?.name ?? "first destination";

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Rules</h2>
        {!editing && (
          <button
            onClick={() => setEditing("new")}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white dark:bg-white dark:text-neutral-900"
          >
            New rule
          </button>
        )}
      </div>

      {editing && (
        <RuleForm
          initial={editing === "new" ? undefined : toInput(editing)}
          repositories={me.data?.repositories ?? []}
          slackTargets={targets.data ?? []}
          saving={save.isPending}
          error={save.error ? (save.error as Error).message : null}
          onCancel={() => {
            save.reset();
            setEditing(null);
          }}
          onSave={(input) => save.mutate(input)}
        />
      )}

      {toggle.error || remove.error ? (
        <p role="alert" className="text-sm text-red-600">
          {((toggle.error ?? remove.error) as Error).message}
        </p>
      ) : null}

      <ul className="space-y-2">
        {rules.data?.length ? (
          rules.data.map((r) => (
            <li key={r.id} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-medium">
                    {r.name}
                    {!r.enabled && <span className="ml-2 text-xs font-normal text-neutral-500">(disabled)</span>}
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-400">
                    <span className="font-mono text-xs">{r.events.join(", ")}</span> on{" "}
                    {r.repository?.fullName ?? "all repositories"}
                    {conditionText(r) && <> where {conditionText(r)}</>}
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-400">
                    →{" "}
                    {r.actions
                      .map((a) =>
                        a.type === "add_label"
                          ? `add label “${a.label}”`
                          : a.type === "comment"
                            ? "post a comment"
                            : a.type === "ai_triage"
                              ? `AI triage${a.applyLabels ? " (+ apply labels)" : ""}`
                              : `Slack alert to ${targetName(a.targetId)}`,
                      )
                      .join(", ")}
                  </div>
                </div>
                <div className="flex shrink-0 gap-3 text-xs">
                  <button onClick={() => toggle.mutate(r)} className="text-neutral-600 hover:underline dark:text-neutral-300">
                    {r.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => setEditing(r)} className="text-blue-600 hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => confirm(`Delete rule “${r.name}”?`) && remove.mutate(r.id)}
                    className="text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))
        ) : (
          <li className="rounded-md border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            {rules.isLoading ? "Loading…" : "No rules yet. Example: issues whose title contains “bug” → add the bug label and alert Slack."}
          </li>
        )}
      </ul>
    </main>
  );
}

function toInput(r: Rule): RuleInput {
  return {
    name: r.name,
    repositoryId: r.repositoryId,
    enabled: r.enabled,
    events: r.events,
    conditions: r.conditions,
    actions: r.actions,
  };
}

function conditionText(r: Rule): string {
  return (Object.keys(CONDITION_LABELS) as (keyof RuleInput["conditions"])[])
    .filter((k) => r.conditions[k]?.length)
    .map((k) => `${CONDITION_LABELS[k]} ${r.conditions[k].map((v) => `“${v}”`).join(" or ")}`)
    .join(" and ");
}
