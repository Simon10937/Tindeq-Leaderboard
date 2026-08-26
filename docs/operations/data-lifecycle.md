# Personal tracker data posture

The personal tracker stores imported Tindeq sessions locally in the browser by default. When Supabase sync is enabled, each saved session is stored as one owner-scoped `tracker_sessions` row containing the full normalized session JSON plus query columns for mode, grip, and test date.

There is no group leaderboard, public ranking, invitation flow, moderation queue, or evidence-download workflow in the active product surface. Row Level Security limits synced tracker rows to the authenticated owner.

Sign-in does not erase browser data. If local sessions are present after a user signs in, the app keeps the local store active until the user chooses either:

- Upload local sessions to Supabase.
- Use Supabase only, leaving those local sessions in the browser.

Production data preservation matters once Supabase sync is enabled. Any destructive remote schema command requires a backup/export confirmation and explicit approval for the target Supabase project before it runs.

The only server-role Supabase client lives in `src/lib/supabase/admin.ts`. Do not use that client for tracker session CRUD paths; those should go through the authenticated user client so RLS is exercised.
