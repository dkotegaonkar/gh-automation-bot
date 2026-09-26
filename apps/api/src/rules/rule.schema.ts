import { z } from 'zod';

/** `<event>.<action>` keys a rule can listen to (push has no action). */
export const EVENT_KEYS = [
  'issues.opened',
  'issues.reopened',
  'issues.edited',
  'pull_request.opened',
  'pull_request.reopened',
  'pull_request.synchronize',
  'push',
] as const;
export type EventKey = (typeof EVENT_KEYS)[number];

const keywords = z.array(z.string().trim().min(1).max(100)).max(20).default([]);

/** Every non-empty condition must match (AND); within one list, any value matches (OR). */
export const conditionsSchema = z
  .object({
    titleContains: keywords,
    bodyContains: keywords,
    authors: keywords,
    labels: keywords,
    branches: keywords,
  })
  .strict();

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_label'), label: z.string().trim().min(1).max(50) }).strict(),
  z.object({ type: z.literal('comment'), body: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal('slack'), targetId: z.string().min(1).optional() }).strict(),
  z.object({ type: z.literal('ai_triage'), applyLabels: z.boolean().default(false) }).strict(),
]);

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    repositoryId: z.string().min(1).nullable().default(null),
    enabled: z.boolean().default(true),
    events: z.array(z.enum(EVENT_KEYS)).min(1),
    conditions: conditionsSchema,
    actions: z.array(actionSchema).min(1).max(10),
  })
  .strict();

export type Conditions = z.infer<typeof conditionsSchema>;
export type RuleAction = z.infer<typeof actionSchema>;
export type RuleInput = z.infer<typeof ruleInputSchema>;
