# Personal Tindeq Tracker

This is a bare-bones, personal tracker for CSVs exported by the Tindeq app. It is designed for mobile use and focuses on one main output: progress over time by test mode, grip, hand, and metric.

The supported imports are Endurance, Repeater, and Peak Force CSV exports. Each import can come from a Tindeq ZIP or CSV upload, then gets tagged with a grip type and optional hand/notes. Every saved CSV can also be inspected as a full force trace.

## Stack

- Next.js App Router and TypeScript
- Browser-local persistence with IndexedDB and an in-memory fallback
- Optional private Supabase sync for personal data across devices
- Vitest and Playwright

## Local setup

1. Install Node from `.nvmrc`, then run `npm ci`.
2. Run `npm run dev`.
3. Open the local app on your phone or browser and import Tindeq ZIP/CSV exports.

Supabase sync is optional locally. To test it, copy `.env.example` to `.env.local` and provide the Supabase values.

Quality commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`.
