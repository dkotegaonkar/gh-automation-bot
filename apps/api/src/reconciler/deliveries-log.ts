/** One attempt from GET /app/hook/deliveries. `id` is kept as a string: it exceeds 2^53. */
export interface HookDeliveryAttempt {
  id: string;
  guid: string;
  delivered_at: string;
  redelivery: boolean;
  status_code: number;
  event: string;
  action: string | null;
}

/**
 * JSON.parse silently rounds integers above Number.MAX_SAFE_INTEGER, so a delivery id like
 * 3844943234996371456 becomes 3844943234996371500 and the redeliver call 404s. Quote ids first.
 */
export function parseDeliveriesPage(text: string): HookDeliveryAttempt[] {
  const safe = text.replace(/"id"\s*:\s*(\d+)/g, '"id":"$1"');
  const rows = JSON.parse(safe) as HookDeliveryAttempt[];
  return rows.map((r) => ({ ...r, id: String(r.id) }));
}

export interface RedeliveryCandidate {
  guid: string;
  /** Latest attempt id; redelivering any attempt of a guid re-sends the same event. */
  attemptId: string;
  event: string;
  attempts: number;
}

/**
 * GUIDs that never got a 2xx from us, are for events we handle, have been retried fewer than
 * `maxAttempts` times, and whose last attempt is older than `settleMs` (so we do not race GitHub).
 */
export function findRedeliveryCandidates(
  attempts: HookDeliveryAttempt[],
  opts: { handledEvents: Set<string>; maxAttempts: number; settleMs: number; now: number },
): RedeliveryCandidate[] {
  const byGuid = new Map<string, HookDeliveryAttempt[]>();
  for (const a of attempts) byGuid.set(a.guid, [...(byGuid.get(a.guid) ?? []), a]);

  const out: RedeliveryCandidate[] = [];
  for (const [guid, list] of byGuid) {
    if (list.some((a) => a.status_code >= 200 && a.status_code < 300)) continue;
    const latest = list.reduce((x, y) => (Date.parse(y.delivered_at) > Date.parse(x.delivered_at) ? y : x));
    if (!opts.handledEvents.has(latest.event)) continue;
    if (list.length >= opts.maxAttempts) continue;
    if (opts.now - Date.parse(latest.delivered_at) < opts.settleMs) continue;
    out.push({ guid, attemptId: latest.id, event: latest.event, attempts: list.length });
  }
  return out;
}
