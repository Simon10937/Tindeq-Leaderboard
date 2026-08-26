# Deployment Runbook

The active product is a personal Tindeq tracker deployed on Vercel with optional private Supabase sync.

## Required secrets

For local-only demos, set `NEXT_PUBLIC_LOCAL_DEMO=true`. The app will run without Supabase and will keep data in each browser.

For private sync, configure `NEXT_PUBLIC_LOCAL_DEMO=false`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `NEXT_PUBLIC_APP_URL`. Only the two public Supabase values and the app URL may enter the browser bundle. `SUPABASE_SECRET_KEY` is server-only.

Reject copied placeholder values before deploy. The app throws unless real Supabase public values are present when local demo mode is off.

## Friend access

Use pre-created Supabase Auth users for friends. Public signup is disabled in `supabase/config.toml`, and the app requests passwordless email links with `shouldCreateUser: false`.

Keep redirect URLs aligned with the deployed app:

- `https://tindeq-leaderboard.vercel.app/auth/callback`
- `http://localhost:3000/auth/callback`
- `http://127.0.0.1:3000/auth/callback`

For a new production domain or Vercel preview, add the exact `/auth/callback` URL in Supabase before testing magic links.

## Existing data

Existing synced Supabase rows are preserved by default. Do not reset or replace the production Supabase project to ship this branch.

Existing browser-local sessions are also preserved during sign-in. When a signed-in user has local sessions in the browser, the app asks whether to upload them to Supabase or use Supabase without uploading. Failed uploads leave browser data local and visible.

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
5. Smoke-test local-only mode, sign-in for a pre-created user, the local-session upload prompt, importing Tindeq ZIP/CSV files, saving locally, saving to Supabase, progress charts, history editing, and trace inspection.
6. Promote only after the Supabase target and data-preservation posture are intentional.
