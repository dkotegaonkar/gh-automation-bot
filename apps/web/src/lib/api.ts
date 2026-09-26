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
