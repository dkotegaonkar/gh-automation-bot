import { summarizeDelivery } from './summarize';

describe('summarizeDelivery', () => {
  it('summarizes an issue', () => {
    expect(
      summarizeDelivery('issues', { issue: { title: 'bug: crash', html_url: 'https://x/1', number: 1 } }),
    ).toEqual({ title: 'bug: crash', url: 'https://x/1', number: 1 });
  });

  it('summarizes a push with its first commit line', () => {
    const s = summarizeDelivery('push', {
      ref: 'refs/heads/main',
      commits: [{}, {}],
      head_commit: { message: 'fix thing\n\nlong body' },
      compare: 'https://x/compare',
    });
    expect(s.title).toBe('2 commits to main: fix thing');
  });

  it('never throws on an empty payload', () => {
    for (const e of ['issues', 'pull_request', 'push', 'installation', 'other']) {
      expect(() => summarizeDelivery(e, {})).not.toThrow();
    }
  });
});
