import type { Triage } from '../ai/triage';
import type { EventContext } from '../rules/event-context';

/** Escapes text for Slack mrkdwn (only &, < and > are special). */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildSlackMessage(repo: string, ctx: EventContext, ruleName: string, triage?: Triage | null) {
  const firstLine = ctx.title.split('\n')[0] ?? '';
  const ref = ctx.number ? `#${ctx.number} ` : '';
  const headline = ctx.url ? `<${ctx.url}|${esc(ref + firstLine)}>` : esc(ref + firstLine);
  const meta = [`*${esc(repo)}*`, `\`${ctx.key}\``, `by ${esc(ctx.author)}`, ctx.branch ? `on \`${esc(ctx.branch)}\`` : null]
    .filter(Boolean)
    .join(' · ');

  return {
    text: `[${repo}] ${ctx.key}: ${ref}${firstLine}`, // notification fallback
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `${headline}\n${meta}` } },
      ...(triage
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `:robot_face: *AI triage · ${triage.priority}*${triage.suggestedLabels.length ? ` · suggests ${triage.suggestedLabels.map((l) => `\`${l}\``).join(' ')}` : ''}\n>${esc(triage.summary)}`,
              },
            },
          ]
        : []),
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Rule: ${esc(ruleName)}` }] },
    ],
  };
}
