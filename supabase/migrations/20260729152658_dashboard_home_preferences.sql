alter table public.profiles
  add column preferred_group_id uuid references public.groups(id) on delete set null,
  add column preferred_protocol_version_id uuid references public.protocol_versions(id) on delete set null,
  add column preferred_dashboard_view text not null default 'leaderboard'
    check (preferred_dashboard_view in ('leaderboard', 'progress', 'activity'));
