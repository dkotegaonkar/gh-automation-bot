# GitHub Automation Bot

Event-driven GitHub App: reacts to issues / pull requests / pushes on connected repositories,
applies user-configured rules (label, comment, Slack alert, AI triage) and shows a live log
in a dashboard behind GitHub sign-in.

> 🚧 Work in progress — full setup, deployment and testing instructions will be added here.

- `apps/web` — Next.js (Vercel)
- `apps/api` — NestJS API + SQS worker (AWS EC2, Docker Compose, Caddy)
- Postgres on Neon (Prisma), queue on AWS SQS, AI via Groq

See `.env.example` for configuration.
