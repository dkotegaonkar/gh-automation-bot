import { toEventContext } from './event-context';
import { matchesRule } from './matcher';
import { conditionsSchema, ruleInputSchema } from './rule.schema';

const issue = (overrides: Record<string, unknown> = {}) =>
  toEventContext('issues', {
    action: 'opened',
    sender: { login: 'alice', type: 'User' },
    issue: {
      number: 7,
      title: 'Bug: app crashes on save',
      body: 'Steps to reproduce...',
      user: { login: 'alice' },
      labels: [{ name: 'needs-triage' }],
      html_url: 'https://github.com/o/r/issues/7',
      ...overrides,
    },
  })!;

const rule = (conditions: Record<string, unknown>, events = ['issues.opened']) => ({
  events,
  conditions: conditionsSchema.parse(conditions),
});

describe('matchesRule', () => {
  it('matches on event alone when there are no conditions', () => {
    expect(matchesRule(rule({}), issue())).toBe(true);
  });

  it('requires the event key to match', () => {
    expect(matchesRule(rule({}, ['pull_request.opened']), issue())).toBe(false);
  });

  it('matches title keywords case-insensitively, any of them', () => {
    expect(matchesRule(rule({ titleContains: ['BUG'] }), issue())).toBe(true);
    expect(matchesRule(rule({ titleContains: ['feature', 'crash'] }), issue())).toBe(true);
    expect(matchesRule(rule({ titleContains: ['feature'] }), issue())).toBe(false);
  });

  it('ANDs different conditions together', () => {
    expect(matchesRule(rule({ titleContains: ['bug'], authors: ['bob'] }), issue())).toBe(false);
    expect(matchesRule(rule({ titleContains: ['bug'], authors: ['Alice'] }), issue())).toBe(true);
  });

  it('matches existing labels', () => {
    expect(matchesRule(rule({ labels: ['needs-triage'] }), issue())).toBe(true);
    expect(matchesRule(rule({ labels: ['p0'] }), issue())).toBe(false);
  });

  it('matches push branches and commit messages', () => {
    const push = toEventContext('push', {
      ref: 'refs/heads/main',
      commits: [{ message: 'hotfix: null check\n\ndetails' }],
      pusher: { name: 'carol' },
      sender: { login: 'carol', type: 'User' },
    })!;
    expect(push.number).toBeNull();
    expect(matchesRule(rule({ branches: ['main'], titleContains: ['hotfix'] }, ['push']), push)).toBe(true);
    expect(matchesRule(rule({ branches: ['develop'] }, ['push']), push)).toBe(false);
  });

  it('ignores branch deletions', () => {
    expect(toEventContext('push', { deleted: true, ref: 'refs/heads/x' })).toBeNull();
  });
});

describe('ruleInputSchema', () => {
  const valid = { name: 'Bugs', events: ['issues.opened'], conditions: {}, actions: [{ type: 'add_label', label: 'bug' }] };

  it('accepts a minimal rule and fills defaults', () => {
    const r = ruleInputSchema.parse(valid);
    expect(r.enabled).toBe(true);
    expect(r.repositoryId).toBeNull();
    expect(r.conditions.titleContains).toEqual([]);
  });

  it('rejects unknown events, unknown action types and extra fields', () => {
    expect(ruleInputSchema.safeParse({ ...valid, events: ['issues.deleted'] }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...valid, actions: [{ type: 'delete_repo' }] }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...valid, userId: 'someone-else' }).success).toBe(false);
  });

  it('requires at least one action', () => {
    expect(ruleInputSchema.safeParse({ ...valid, actions: [] }).success).toBe(false);
  });
});
