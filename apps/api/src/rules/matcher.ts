import type { EventContext } from './event-context';
import type { Conditions } from './rule.schema';

const lower = (s: string) => s.toLowerCase();
const containsAny = (text: string, needles: string[]) => needles.some((n) => lower(text).includes(lower(n)));
const equalsAny = (value: string | null, options: string[]) =>
  value !== null && options.some((o) => lower(o) === lower(value));

/** Pure and case-insensitive. Empty condition lists are ignored. */
export function matchesRule(rule: { events: readonly string[]; conditions: Conditions }, ctx: EventContext): boolean {
  if (!rule.events.includes(ctx.key)) return false;
  const c = rule.conditions;
  if (c.titleContains.length && !containsAny(ctx.title, c.titleContains)) return false;
  if (c.bodyContains.length && !containsAny(ctx.body, c.bodyContains)) return false;
  if (c.authors.length && !equalsAny(ctx.author, c.authors)) return false;
  if (c.labels.length && !c.labels.some((l) => equalsAny(l, ctx.labels))) return false;
  if (c.branches.length && !equalsAny(ctx.branch, c.branches)) return false;
  return true;
}
