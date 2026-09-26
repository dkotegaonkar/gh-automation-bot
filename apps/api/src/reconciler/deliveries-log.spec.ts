import { findRedeliveryCandidates, HookDeliveryAttempt, parseDeliveriesPage } from './deliveries-log';

describe('parseDeliveriesPage', () => {
  it('keeps 64-bit delivery ids exact (JSON.parse would round them)', () => {
    const text = '[{"id":3844943234996371456,"guid":"g1","delivered_at":"2026-09-26T16:46:56Z","redelivery":false,"status_code":502,"event":"ping","action":null}]';
    expect(String(JSON.parse(text)[0].id)).toBe('3844943234996371500'); // the bug: silently rounded
    expect(parseDeliveriesPage(text)[0]!.id).toBe('3844943234996371456');
  });
});

describe('findRedeliveryCandidates', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  const at = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  const attempt = (guid: string, status: number, minsAgo: number, event = 'issues', id = guid + minsAgo): HookDeliveryAttempt => ({
    id,
    guid,
    delivered_at: at(minsAgo),
    redelivery: false,
    status_code: status,
    event,
    action: 'opened',
  });
  const opts = { handledEvents: new Set(['issues', 'push']), maxAttempts: 3, settleMs: 2 * 60_000, now };

  it('picks deliveries that never succeeded, using the latest attempt', () => {
    const c = findRedeliveryCandidates([attempt('a', 502, 30), attempt('a', 0, 10, 'issues', 'latest')], opts);
    expect(c).toEqual([{ guid: 'a', attemptId: 'latest', event: 'issues', attempts: 2 }]);
  });

  it('skips anything that eventually got a 2xx', () => {
    expect(findRedeliveryCandidates([attempt('a', 502, 30), attempt('a', 202, 20)], opts)).toEqual([]);
  });

  it('skips unhandled events, exhausted guids and very recent failures', () => {
    const list = [
      attempt('ping', 502, 30, 'ping'),
      attempt('x', 502, 30),
      attempt('x', 502, 20),
      attempt('x', 502, 10),
      attempt('fresh', 502, 1),
    ];
    expect(findRedeliveryCandidates(list, opts)).toEqual([]);
  });
});
