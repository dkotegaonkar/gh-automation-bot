/** The normalized facts about a GitHub event that rules match on and actions use. */
export interface EventContext {
  key: string;
  title: string;
  body: string;
  author: string;
  labels: string[];
  branch: string | null;
  /** Issue/PR number; null for push (nothing to label or comment on). */
  number: number | null;
  url: string | null;
  senderLogin: string;
  senderIsBot: boolean;
}

const names = (labels: unknown): string[] =>
  Array.isArray(labels) ? labels.map((l: { name?: string }) => l?.name ?? '').filter(Boolean) : [];

export function toEventContext(event: string, payload: Record<string, any>): EventContext | null {
  const sender = { senderLogin: payload.sender?.login ?? '', senderIsBot: payload.sender?.type === 'Bot' };

  if (event === 'issues' || event === 'pull_request') {
    const item = event === 'issues' ? payload.issue : payload.pull_request;
    if (!item) return null;
    return {
      key: `${event}.${payload.action}`,
      title: item.title ?? '',
      body: item.body ?? '',
      author: item.user?.login ?? '',
      labels: names(item.labels),
      branch: event === 'pull_request' ? (item.base?.ref ?? null) : null,
      number: item.number ?? null,
      url: item.html_url ?? null,
      ...sender,
    };
  }

  if (event === 'push') {
    if (payload.deleted) return null; // branch deletion, nothing to act on
    const commits: { message?: string }[] = Array.isArray(payload.commits) ? payload.commits : [];
    return {
      key: 'push',
      title: commits.map((c) => (c.message ?? '').split('\n')[0]).join('\n'),
      body: commits.map((c) => c.message ?? '').join('\n\n'),
      author: payload.pusher?.name ?? payload.sender?.login ?? '',
      labels: [],
      branch: String(payload.ref ?? '').replace(/^refs\/heads\//, '') || null,
      number: null,
      url: payload.compare ?? null,
      ...sender,
    };
  }

  return null;
}
