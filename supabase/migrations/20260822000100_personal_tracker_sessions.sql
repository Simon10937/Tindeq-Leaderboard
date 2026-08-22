create table if not exists public.tracker_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session jsonb not null,
  mode text not null,
  grip text not null,
  tested_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracker_sessions_mode_check
    check (mode in ('endurance', 'repeater', 'unsupported_trace')),
  constraint tracker_sessions_session_object_check
    check (jsonb_typeof(session) = 'object')
);

create index if not exists tracker_sessions_user_tested_at_idx
  on public.tracker_sessions (user_id, tested_at desc);

alter table public.tracker_sessions enable row level security;

grant select, insert, update, delete on public.tracker_sessions to authenticated;

drop policy if exists "Users can view their tracker sessions" on public.tracker_sessions;
create policy "Users can view their tracker sessions"
  on public.tracker_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their tracker sessions" on public.tracker_sessions;
create policy "Users can insert their tracker sessions"
  on public.tracker_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their tracker sessions" on public.tracker_sessions;
create policy "Users can update their tracker sessions"
  on public.tracker_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their tracker sessions" on public.tracker_sessions;
create policy "Users can delete their tracker sessions"
  on public.tracker_sessions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
