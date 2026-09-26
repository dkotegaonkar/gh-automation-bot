# gh-automation-bot

GitHub App bot: receives webhooks (issues, pull_request, push), runs user-configured rules,
acts on GitHub (label/comment) + Slack, optional Groq AI triage. Dashboard shows a live log.

## Layout
- `apps/web` — Next.js 16 (App Router), deployed on Vercel. Proxies `/api/*` to the API via
  `next.config.ts` rewrites so the session cookie is first-party. Next 16 differs from older
  versions (e.g. `middleware.ts` is now `proxy.ts`) — read `apps/web/node_modules/next/dist/docs/`
  before using an API you're unsure of.
- `apps/api` — NestJS 12 on AWS EC2 (Docker Compose: api + worker + Caddy for TLS).
  - `main.ts` = HTTP process, `main.worker.ts` = SQS consumer. Same image, different command.
  - Prisma 7 with `@prisma/adapter-pg`; client generated to `src/generated/prisma` (CJS, gitignored).
- `infra/` — compose file, Caddyfile.

## Deployment facts
- API host: `https://gh-automation-bot.publicvm.com` → EC2 Elastic IP `32.194.194.95` (Ubuntu 26.04,
  t3.micro-class: 1 vCPU / 1 GB RAM + 2 GB swap). SSH: `ssh -i ~/.ssh/gh-automation-bot.pem ubuntu@32.194.194.95`.
  App dir on the box: `/opt/gh-bot` (compose file + `.env`, chmod 600). Build images in CI, not on the box.
- TLS: Caddy + Let's Encrypt. (The `ec2-*.compute-1.amazonaws.com` name can't get a cert — LE policy rejects it.)
- SQS (us-east-1): `gh-automation-queue` → redrive to `gh-automation-dlq` after 5 receives (DLQ keeps 14 days).
  Worker sets VisibilityTimeout=60 and WaitTimeSeconds=20 on ReceiveMessage.

## Commands (run from the app folder)
- api: `pnpm dev` (tsc watch + api + worker), `pnpm test` (vitest), `pnpm typecheck`,
  `pnpm prisma:migrate`, `pnpm build`
- web: `pnpm dev`, `pnpm build`, `pnpm lint`

## Toolchain gotchas
- Do NOT use the Nest CLI (`nest build/start/new`). On Node 22.14 it crashes with
  `ERR_REQUIRE_CYCLE_MODULE` (its angular-devkit dep `require()`s ESM-only `ora`). We build with plain `tsc`.
- Tests use vitest + unplugin-swc (SWC emits decorator metadata; esbuild does not). Not jest.
- Nest 12 packages are ESM; our app compiles to CJS and relies on Node 22's `require(esm)`.

## Non-negotiable invariants (this is what the project is graded on)
1. **Verify before trust**: webhook HMAC (`X-Hub-Signature-256`) is checked against `req.rawBody`
   with `timingSafeEqual` before the body is parsed or used. Reject → 401.
2. **Idempotency**: `Delivery.githubDeliveryId` is unique — duplicate delivery = no-op 200.
   Every side effect is an `ActionRun` with a unique `idempotencyKey`
   (`deliveryId:ruleId:type`); never perform an action whose run is already SUCCEEDED.
   Comments carry a hidden `<!-- ghbot:{idempotencyKey} -->` marker; check for it before posting on retry.
3. **No silent loss**: persist first, then send to SQS (outbox). A sweeper re-enqueues deliveries
   stuck in RECEIVED. Worker failures → SQS retry with backoff → DLQ; failures visible in dashboard.
   A reconciler asks GitHub to redeliver failed deliveries missing from our DB.
4. **Secrets**: only via env (validated in `src/config/env.ts`). Never log tokens, cookies,
   signatures, webhook URLs — add new secret-shaped fields to `REDACT_PATHS`. Slack URLs are
   encrypted at rest. GitHub tokens never reach the browser. AWS creds come from the EC2 IAM role.
5. The bot ignores events it caused itself (avoid feedback loops).

## Conventions
- One Nest module per concern (`webhooks`, `queue`, `processing`, `rules`, `actions`, `github`, `ai`, `auth`).
- Validate all external input (request bodies, rule JSON, LLM output) with zod.
- Unit-test pure logic (signature verify, rule matcher, idempotency keys) alongside the source as `*.spec.ts`.
- Small, focused commits.
