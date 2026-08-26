# Deployment Runbook

The active product is a personal Tindeq tracker deployed on Vercel with optional private Supabase sync.

## Required secrets

Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `NEXT_PUBLIC_APP_URL`. Only the two `NEXT_PUBLIC_` values may enter the browser bundle.

Local-only browser storage still works without Supabase, but cross-device private sync requires these values in Vercel and `.env.local`.

## Reset safety

Local reset commands are safe against disposable local databases:

```bash
npx supabase db reset
```

Do not run destructive remote schema commands against production by default. A production reset or destructive migration requires all of the following in writing before the command runs:

- target Supabase project id and environment name
- confirmed backup or export location
- explicit approval that existing remote data may be replaced

## Release order

1. Build and test the exact lockfile commit locally.
2. For a fresh or disposable Supabase project, run the current tracker migration set from a clean reset.
3. For any remote project that has already applied older migrations, do not delete or rewrite remote history casually. Back up the project, inspect `supabase_migrations.schema_migrations`, then use forward migrations or an explicit `supabase migration repair` plan approved for that project.
4. Deploy a Vercel preview against preview Supabase values when possible.
5. Smoke-test sign-in, importing Tindeq ZIP/CSV files, saving locally, saving to Supabase, progress charts, history editing, and trace inspection.
6. Promote only after the Supabase target and data-preservation posture are intentional.
