# Cruxboard

Cruxboard is a private, invite-only companion for Tindeq climbing assessments. Members upload Tindeq CSV exports against shared, immutable protocols; the application preserves private source evidence and can compare eligible results through protocol-specific leaderboards and progress charts.

The first release targets rate of force development (RFD). Ranking is intentionally disabled until `tests/oracles/rfd/manifest.json` contains an independently calculated, reviewed, and approved numeric oracle. Uploads remain private while that gate is closed. Maximum pull, critical force, and repeater fixtures are preserved for later adapters and are not ranked.

## Stack

- Next.js App Router and TypeScript, hosted on Vercel
- Supabase Auth, Postgres, Row Level Security, and private Storage
- Resend for group invitation delivery
- Vitest and Playwright

## Local setup

1. Install Node from `.nvmrc`, then run `npm ci`.
2. Copy `.env.example` to `.env.local` and replace every placeholder.
3. Start Docker, run `npx supabase start`, then `npx supabase db reset`.
4. Run `npm run dev`.

Quality commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`.

See [the calculation contract](docs/calculation-contract.md), [deployment runbook](docs/operations/deployment.md), and [data lifecycle runbook](docs/operations/data-lifecycle.md).
