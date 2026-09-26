# GitHub Automation Bot

A GitHub App that reacts to activity in your repositories. When an issue or pull request is opened
(or code is pushed), it runs the rules you configure: add a label, post a comment, send a Slack alert,
and optionally run AI triage (summary, priority, suggested labels). A dashboard behind GitHub sign-in
shows a live log of every event and everything the bot did, including failures and retries.

- **App:** https://gh-automation-bot-web.vercel.app
- **API:** https://gh-automation-bot.publicvm.com/api/health/ready
- **GitHub App:** https://github.com/apps/gh-automation-bot-dk

## Try it (reviewers)

1. Open the app and **Sign in with GitHub**.
2. Click **+ Connect repositories** and install the app on a repository you own. A new empty repo is ideal.
   You come back to the dashboard and the repo is listed.
3. **Settings:** add a Slack destination by pasting a Slack Incoming Webhook URL
   (Slack app → Features → Incoming Webhooks → Add New Webhook), then click **Send test**.
4. **Rules → New rule**, for example:
   - **When:** `issues.opened`
   - **Only if:** title contains `bug`
   - **Then:** AI triage, add label `bug`, post comment `Thanks {{author}}! AI summary: {{ai_summary}}`, send a Slack alert
5. Open an issue titled **"Bug: login button does nothing"** in that repo.
   Within a few seconds, **Activity** shows the event as `PROCESSED`, with each action's result
   (P-priority badge and summary, label, a link to the comment, Slack), and the alert arrives in Slack.
6. Things worth trying:
   - **Duplicates:** in the GitHub App's *Advanced* tab, **Redeliver** that delivery. The API answers
     `{"outcome":"duplicate"}` and nothing runs twice.
   - **Negative case:** an issue titled "Add dark mode" is processed with no actions.
   - **Self-loop guard:** the `issues.labeled` event caused by the bot's own label shows as `IGNORED`.
   - **Forged request:**
     ```bash
     curl -i -X POST https://gh-automation-bot.publicvm.com/api/webhooks/github \
       -H 'x-github-event: issues' -H 'x-github-delivery: fake-1' \
       -H 'x-hub-signature-256: sha256=00' -d '{}'
     ```
     This returns `401`.

No test credentials are needed: you sign in with your own GitHub account and only see repositories you
installed the app on.

## Architecture

```
GitHub ──webhook──▶ Caddy (TLS) ─▶ NestJS API ──1. verify HMAC──2. INSERT delivery (unique id)──▶ Neon Postgres
  ▲                                     │                                                         ▲
  │                                     └──3. SendMessage──▶ AWS SQS ──▶ NestJS worker ─────────────┘
  │                                                            │  (DLQ after 5 receives)    │
  └──── labels / comments (installation token) ◀──────────────────────────────────────────┤
                                            Slack Incoming Webhook ◀──────────────────────────┤
                                            Groq (AI triage) ◀───────────────────────────────┘

Browser ──▶ Next.js on Vercel ──/api/* rewrite──▶ NestJS API   (session cookie stays first-party)
```

| Part | Tech | Where |
|---|---|---|
| Web | Next.js 16 (App Router), TanStack Query, Tailwind | Vercel (`apps/web`) |
| API + worker | NestJS 12, one image, two processes | AWS EC2 t2.micro, Docker Compose, Caddy + Let's Encrypt (`apps/api`, `infra/`) |
| Database | Postgres + Prisma 7 (`@prisma/adapter-pg`) | Neon, us-east-1 |
| Queue | AWS SQS standard queue + dead-letter queue | us-east-1 |
| Auth | GitHub App (user OAuth for sign-in, JWT → installation tokens for bot actions) | |
| AI | Groq, `openai/gpt-oss-120b` (free tier) | |

## Reliability and security

The brief's quality bar, and how the app meets it:

**Forged or replayed requests**
- `X-Hub-Signature-256` is verified against the **raw request bytes** with a constant-time HMAC comparison
  before the body is used. A bad or missing signature gets `401`.
- A replayed request is a duplicate delivery ID, so it does nothing.
- Sign-in uses a random `state` value bound to an httpOnly cookie, to prevent CSRF.
- Installations are linked to a user only through `GET /user/installations` with that user's own token,
  never from a query parameter.
- Every dashboard endpoint is scoped to the signed-in user. Rules can only reference the user's own
  repositories and Slack destinations, and unknown fields are rejected.

**Nothing happens twice**
- `Delivery.githubDeliveryId` (from `X-GitHub-Delivery`) is unique, so a redelivered event is acknowledged and dropped.
- Each side effect is an `ActionRun` with a unique key `deliveryId:ruleId:actionIndex`. Actions that
  already succeeded are never re-run, even when SQS delivers the same message twice or a retry is
  triggered by hand.
- Labels are idempotent on GitHub's side.
- Comments include a hidden `<!-- ghbot:<key> -->` marker, and on retry the bot looks for it before posting.
- The bot ignores events caused by its own `[bot]` account, so it can't trigger itself in a loop.

**Nothing is silently lost**
- The API stores the delivery **before** enqueuing it (outbox pattern), then replies `202` well within
  GitHub's 10-second limit.
- If SQS is unavailable, the delivery stays `RECEIVED`, and an **outbox sweeper** re-enqueues it within about a minute.
- The worker deletes an SQS message only after processing succeeds. Failures retry with exponential
  backoff (30s, 60s, 120s, …), and after 5 receives SQS moves the message to the **dead-letter queue**.
- The delivery and its actions show `FAILED` with the error in the dashboard (**Activity → Failed**),
  with a **Retry** button that re-runs only what failed.
- GitHub does not retry failed webhooks itself. A **reconciler** reads the app's delivery log every
  5 minutes and asks GitHub to redeliver anything that never got a 2xx and isn't in the database.
  This covers downtime and deploys.
- A partial failure (for example, Slack down while the label succeeded) retries only the failed action.

**No exposed secrets**
- Secrets live only in environment variables, validated at startup (`apps/api/src/config/env.ts`).
  `.env.example` contains no real values.
- Logs redact authorization, cookies, the signature header, and OAuth `code`/`state`.
- Slack webhook URLs are stored encrypted with AES-256-GCM and only ever returned masked.
- GitHub tokens never reach the browser. The user token is used once at sign-in and never stored.
  Installation tokens are short-lived.
- On EC2, AWS credentials come from an **instance role** (SQS-only, both queues); there are no access keys on the box.
- **SSH port 22 is closed to the internet.** CI opens it for its own IP for the length of one deploy
  and always closes it afterwards. The IAM user it uses may only edit that one security group.
- Issue text sent to the LLM is fenced as untrusted. Output is validated, and AI-applied labels are
  restricted to an allowlist, so prompt injection can't invent labels.

## Run locally

Prerequisites: Node 22, pnpm 10, a Postgres database (a free Neon project is fine), and an AWS account
with an SQS queue and dead-letter queue (credentials from `aws login` or a profile).

```bash
pnpm install
cp .env.example apps/api/.env               # fill in the values (see below)
pnpm --filter api prisma:migrate             # create tables
pnpm --filter api dev                        # API on :4000 + worker (tsc --watch)
echo "API_URL=http://localhost:4000" > apps/web/.env.local
pnpm --filter web dev                        # web on :3000
```

To receive webhooks locally, create a **second** GitHub App for development:
- Webhook URL: a tunnel such as `https://smee.io/<channel>` forwarded to
  `http://localhost:4000/api/webhooks/github`.
- Callback URL: `http://localhost:3000/api/auth/github/callback`.
- Set `WEB_URL=http://localhost:3000` and `API_URL=http://localhost:4000`.

Tests: `pnpm --filter api test` covers signature verification, rule matching, the rule schema,
encryption, retry backoff, AI output parsing, and the reconciler's candidate selection and 64-bit ID parsing.

### Environment variables (`apps/api/.env`)

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT`, `LOG_LEVEL` | Runtime; `production` enables secure cookies and JSON logs |
| `WEB_URL`, `API_URL` | Public URLs of the web app and the API |
| `DATABASE_URL` | Pooled Postgres URL used at runtime (`sslmode=verify-full`) |
| `DIRECT_DATABASE_URL` | Direct (non-pooled) URL used by migrations |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG` | GitHub App identity |
| `GITHUB_APP_PRIVATE_KEY_B64` | The app's `.pem`, base64-encoded (`base64 -i key.pem \| tr -d '\n'`) |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub App user OAuth credentials |
| `GITHUB_WEBHOOK_SECRET` | Webhook HMAC secret (`openssl rand -hex 32`) |
| `SESSION_SECRET` | Signs session JWTs (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY_B64` | 32-byte AES key for Slack URLs (`openssl rand -base64 32`) |
| `AWS_REGION`, `SQS_QUEUE_URL`, `SQS_DLQ_URL` | Queue configuration |
| `GROQ_API_KEY`, `GROQ_MODEL` | Optional; without a key, AI triage actions are skipped |

The web app needs only `API_URL`, which is where `/api/*` is proxied.

## How it's deployed

- **GitHub App** (`gh-automation-bot-dk`):
  - Permissions: Issues and Pull requests read & write, Contents read, Metadata read.
  - Events: issues, pull_request, push.
  - "Request user authorization during installation" is on, so installing also signs you in.
  - The callback goes to the Vercel origin; the webhook goes straight to the API host, so the signature
    is checked on unmodified bytes.
- **Web:** Vercel project with root directory `apps/web` and env `API_URL`. It deploys on every push to `main`.
- **API:**
  - EC2 t2.micro (Ubuntu 26.04, 2 GB swap) with an Elastic IP and the DNS name `gh-automation-bot.publicvm.com`.
  - `infra/docker-compose.yml` runs `api`, `worker` and `caddy`; Caddy obtains the Let's Encrypt certificate.
  - The production `.env` lives only at `/opt/gh-bot/.env` (mode 600).
- **CI/CD** (`.github/workflows/deploy.yml`, on pushes that touch the API):
  1. typecheck and unit tests;
  2. build the image and push it to GHCR;
  3. `prisma migrate deploy` against Neon;
  4. open a temporary SSH rule for the runner's IP, `docker compose pull && up -d`, and prune old images;
  5. smoke test `/api/health/ready`;
  6. close the SSH rule (always).
- **AWS:**
  - SQS `gh-automation-queue` redrives to `gh-automation-dlq` after 5 receives; the DLQ keeps messages 14 days.
  - The instance role allows only SQS send, receive, delete, change-visibility and get-attributes on those two queues.

Everything runs on free tiers. The AWS resources are covered by the free tier of an account I already had.

## Known limitations

- Some Indian ISPs intermittently reset TLS connections to `*.publicvm.com` (SNI filtering). Browsers
  only talk to Vercel and GitHub talks to the API from its own network, so the product isn't affected,
  but calling the API host directly from such a network may fail.
- Slack Incoming Webhooks have no idempotency key. If the process crashes after Slack accepts the
  message but before the run is recorded, a retry can send the alert twice. The window is milliseconds;
  a bot token plus `chat.postMessage` with a lookup would close it.
- An installation belongs to the user who installed it. Shared org installations with multiple
  dashboard users are not modeled.
- One t2.micro with 1 GB RAM is fine for this load but is a single point of failure. The reconciler
  recovers missed webhooks after downtime.
