export interface DeliverySummary {
  title: string;
  url: string | null;
  number: number | null;
}

/** One-line human description of a webhook payload, for the activity log. */
export function summarizeDelivery(event: string, payload: Record<string, any>): DeliverySummary {
  switch (event) {
    case 'issues':
      return { title: payload.issue?.title ?? '', url: payload.issue?.html_url ?? null, number: payload.issue?.number ?? null };
    case 'pull_request':
      return {
        title: payload.pull_request?.title ?? '',
        url: payload.pull_request?.html_url ?? null,
        number: payload.pull_request?.number ?? null,
      };
    case 'push': {
      const branch = String(payload.ref ?? '').replace('refs/heads/', '');
      const count = Array.isArray(payload.commits) ? payload.commits.length : 0;
      const head = String(payload.head_commit?.message ?? '').split('\n')[0];
      return {
        title: `${count} commit${count === 1 ? '' : 's'} to ${branch}${head ? `: ${head}` : ''}`,
        url: payload.compare ?? null,
        number: null,
      };
    }
    case 'installation':
    case 'installation_repositories':
      return { title: `App ${payload.action} on ${payload.installation?.account?.login ?? 'account'}`, url: null, number: null };
    default:
      return { title: event, url: null, number: null };
  }
}
