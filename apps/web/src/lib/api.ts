// Same-origin calls: /api/* is proxied to the NestJS API by next.config.ts rewrites.

export interface Repository {
  id: string;
  fullName: string;
  private: boolean;
  enabled: boolean;
}

export interface Me {
  user: { login: string; avatarUrl: string | null };
  repositories: Repository[];
}

export interface ActionRun {
  id: string;
  type: "ADD_LABEL" | "COMMENT" | "SLACK" | "AI_TRIAGE";
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  attempts: number;
  lastError: string | null;
  result: unknown;
  completedAt: string | null;
}

export interface Delivery {
  id: string;
  githubDeliveryId: string;
  event: string;
  action: string | null;
  repository: string | null;
  sender: string | null;
  status: "RECEIVED" | "QUEUED" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";
  attempts: number;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
  summary: { title: string; url: string | null; number: number | null };
  actions: ActionRun[];
}

export class UnauthorizedError extends Error {}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "same-origin", ...init });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const EVENT_KEYS = [
  "issues.opened",
  "issues.reopened",
  "issues.edited",
  "pull_request.opened",
  "pull_request.reopened",
  "pull_request.synchronize",
  "push",
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

export interface Conditions {
  titleContains: string[];
  bodyContains: string[];
  authors: string[];
  labels: string[];
  branches: string[];
}

export type RuleAction =
  | { type: "add_label"; label: string }
  | { type: "comment"; body: string }
  | { type: "slack"; targetId?: string };

export interface RuleInput {
  name: string;
  repositoryId: string | null;
  enabled: boolean;
  events: EventKey[];
  conditions: Conditions;
  actions: RuleAction[];
}

export interface Rule extends RuleInput {
  id: string;
  createdAt: string;
  repository: { fullName: string } | null;
}

export interface SlackTarget {
  id: string;
  name: string;
  hint: string;
  createdAt: string;
}

/** Surfaces the API's field-level validation messages. */
export async function apiJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: unknown; issues?: { path: string; message: string }[] };
    const detail = data.issues?.map((i) => `${i.path || "input"}: ${i.message}`).join("; ");
    throw new Error(detail || (typeof data.message === "string" ? data.message : `Request failed (${res.status})`));
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
