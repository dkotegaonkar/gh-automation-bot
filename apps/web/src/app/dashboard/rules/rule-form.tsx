"use client";

import { FormEvent, useState } from "react";
import { Conditions, EVENT_KEYS, EventKey, Repository, RuleAction, RuleInput, SlackTarget } from "@/lib/api";

const input =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700";

const CONDITION_FIELDS: { key: keyof Conditions; label: string; placeholder: string }[] = [
  { key: "titleContains", label: "Title contains any of", placeholder: "bug, crash" },
  { key: "bodyContains", label: "Body contains any of", placeholder: "stack trace" },
  { key: "authors", label: "Author is any of", placeholder: "octocat" },
  { key: "labels", label: "Already has any label", placeholder: "needs-triage" },
  { key: "branches", label: "Branch is any of (PR base / push)", placeholder: "main" },
];

const split = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

interface Props {
  initial?: RuleInput;
  repositories: Repository[];
  slackTargets: SlackTarget[];
  saving: boolean;
  error: string | null;
  onSave: (input: RuleInput) => void;
  onCancel: () => void;
}

export function RuleForm({ initial, repositories, slackTargets, saving, error, onSave, onCancel }: Props) {
  const find = <T extends RuleAction["type"]>(type: T) =>
    initial?.actions.find((a): a is Extract<RuleAction, { type: T }> => a.type === type);

  const [name, setName] = useState(initial?.name ?? "");
  const [repositoryId, setRepositoryId] = useState(initial?.repositoryId ?? "");
  const [events, setEvents] = useState<EventKey[]>(initial?.events ?? ["issues.opened"]);
  const [conditions, setConditions] = useState<Record<keyof Conditions, string>>(() => {
    const c = initial?.conditions;
    return {
      titleContains: c?.titleContains.join(", ") ?? "",
      bodyContains: c?.bodyContains.join(", ") ?? "",
      authors: c?.authors.join(", ") ?? "",
      labels: c?.labels.join(", ") ?? "",
      branches: c?.branches.join(", ") ?? "",
    };
  });
  const [label, setLabel] = useState({ on: !!find("add_label"), value: find("add_label")?.label ?? "" });
  const [comment, setComment] = useState({
    on: !!find("comment"),
    value: find("comment")?.body ?? "Thanks {{author}}! The bot has triaged this.",
  });
  const [slack, setSlack] = useState({ on: !!find("slack"), targetId: find("slack")?.targetId ?? "" });
  const [ai, setAi] = useState({ on: !!find("ai_triage"), applyLabels: find("ai_triage")?.applyLabels ?? false });
  const [localError, setLocalError] = useState<string | null>(null);

  function toggleEvent(e: EventKey) {
    setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const actions: RuleAction[] = [];
    if (ai.on) actions.push({ type: "ai_triage", applyLabels: ai.applyLabels });
    if (label.on) actions.push({ type: "add_label", label: label.value.trim() });
    if (comment.on) actions.push({ type: "comment", body: comment.value.trim() });
    if (slack.on) actions.push(slack.targetId ? { type: "slack", targetId: slack.targetId } : { type: "slack" });
    if (!events.length) return setLocalError("Pick at least one event.");
    if (!actions.length) return setLocalError("Pick at least one action.");
    setLocalError(null);
    onSave({
      name: name.trim(),
      repositoryId: repositoryId || null,
      enabled: initial?.enabled ?? true,
      events,
      conditions: {
        titleContains: split(conditions.titleContains),
        bodyContains: split(conditions.bodyContains),
        authors: split(conditions.authors),
        labels: split(conditions.labels),
        branches: split(conditions.branches),
      },
      actions,
    });
  }

  const onlyPush = events.length > 0 && events.every((e) => e === "push");

  return (
    <form onSubmit={submit} className="space-y-5 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Label bugs" required />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Repository</span>
          <select className={input} value={repositoryId} onChange={(e) => setRepositoryId(e.target.value)}>
            <option value="">All connected repositories</option>
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">When</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {EVENT_KEYS.map((e) => (
            <label key={e} className="flex items-center gap-1.5 font-mono text-xs">
              <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} />
              {e}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2 text-sm">
        <legend className="font-medium">
          Only if <span className="font-normal text-neutral-500">(comma-separated; leave empty to ignore; all filled fields must match)</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CONDITION_FIELDS.map((f) => (
            <label key={f.key} className="space-y-1">
              <span className="text-xs text-neutral-600 dark:text-neutral-400">{f.label}</span>
              <input
                className={input}
                value={conditions[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setConditions((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3 text-sm">
        <legend className="font-medium">Then</legend>
        {onlyPush && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Pushes have no issue or PR, so label and comment actions will be skipped for them.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex w-40 items-center gap-1.5">
            <input type="checkbox" checked={label.on} onChange={(e) => setLabel({ ...label, on: e.target.checked })} />
            Add label
          </label>
          <input
            className={`${input} max-w-xs`}
            value={label.value}
            onChange={(e) => setLabel({ ...label, value: e.target.value })}
            placeholder="bug"
            disabled={!label.on}
            required={label.on}
          />
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <label className="flex w-40 items-center gap-1.5 pt-1.5">
            <input type="checkbox" checked={comment.on} onChange={(e) => setComment({ ...comment, on: e.target.checked })} />
            Post comment
          </label>
          <textarea
            className={`${input} min-h-16 max-w-md flex-1`}
            value={comment.value}
            onChange={(e) => setComment({ ...comment, value: e.target.value })}
            disabled={!comment.on}
            required={comment.on}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex w-40 items-center gap-1.5">
            <input type="checkbox" checked={slack.on} onChange={(e) => setSlack({ ...slack, on: e.target.checked })} />
            Send Slack alert
          </label>
          {slackTargets.length ? (
            <select
              className={`${input} max-w-xs`}
              value={slack.targetId}
              onChange={(e) => setSlack({ ...slack, targetId: e.target.value })}
              disabled={!slack.on}
            >
              <option value="">First destination ({slackTargets[0]!.name})</option>
              {slackTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-neutral-500">Add a Slack destination under Settings first.</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex w-40 items-center gap-1.5">
            <input type="checkbox" checked={ai.on} onChange={(e) => setAi({ ...ai, on: e.target.checked })} />
            AI triage
          </label>
          <label className={`flex items-center gap-1.5 text-xs ${ai.on ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              checked={ai.applyLabels}
              disabled={!ai.on}
              onChange={(e) => setAi({ ...ai, applyLabels: e.target.checked })}
            />
            also apply suggested labels (from a fixed allowlist)
          </label>
        </div>
        <p className="text-xs text-neutral-500">
          AI triage (Groq) summarizes the item and suggests a priority and labels; it runs first, and its result is added to the
          Slack alert. In comments, <code>{"{{author}}"}</code> becomes an @mention, and <code>{"{{ai_summary}}"}</code> /{" "}
          <code>{"{{ai_priority}}"}</code> insert the AI result.
        </p>
      </fieldset>

      {(localError || error) && (
        <p role="alert" className="text-sm text-red-600">
          {localError ?? error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {saving ? "Saving…" : "Save rule"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-neutral-600 dark:text-neutral-300">
          Cancel
        </button>
      </div>
    </form>
  );
}
