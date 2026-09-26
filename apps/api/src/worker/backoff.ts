/** SQS maximum receives before the redrive policy moves a message to the DLQ. Keep in sync with the queue. */
export const MAX_RECEIVES = 5;

/** Retry delay after the Nth failed receive: 30s, 60s, 120s, 240s... capped at 15 minutes. */
export function backoffSeconds(receiveCount: number): number {
  const n = Math.max(1, receiveCount);
  return Math.min(30 * 2 ** (n - 1), 900);
}
