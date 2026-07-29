create table public.dashboard_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  protocol_version_id uuid not null references public.protocol_versions(id) on delete cascade,
  view text not null default 'leaderboard' check (view in ('leaderboard', 'progress', 'activity')),
  hand text not null default 'right' check (hand in ('left', 'right')),
  score_basis text not null default 'absolute' check (score_basis in ('absolute', 'relative')),
  updated_at timestamptz not null default now()
);

insert into public.dashboard_preferences (user_id, group_id, protocol_version_id, view)
select profiles.id, profiles.preferred_group_id, profiles.preferred_protocol_version_id, profiles.preferred_dashboard_view
from public.profiles
join public.group_memberships membership
  on membership.user_id = profiles.id
  and membership.group_id = profiles.preferred_group_id
  and membership.status = 'active'
join public.protocol_versions protocol
  on protocol.id = profiles.preferred_protocol_version_id
  and protocol.group_id = profiles.preferred_group_id
  and protocol.state in ('published', 'locked')
where profiles.preferred_group_id is not null
  and profiles.preferred_protocol_version_id is not null
on conflict (user_id) do nothing;

alter table public.dashboard_preferences enable row level security;

create policy dashboard_preferences_select_self
  on public.dashboard_preferences for select to authenticated
  using (user_id = auth.uid() and private.current_account_active());

create policy dashboard_preferences_insert_self
  on public.dashboard_preferences for insert to authenticated
  with check (
    user_id = auth.uid()
    and private.current_account_active()
    and exists (
      select 1 from public.group_memberships membership
      join public.protocol_versions protocol
        on protocol.id = dashboard_preferences.protocol_version_id
        and protocol.group_id = dashboard_preferences.group_id
        and protocol.state in ('published', 'locked')
      where membership.user_id = auth.uid()
        and membership.group_id = dashboard_preferences.group_id
        and membership.status = 'active'
    )
  );

create policy dashboard_preferences_update_self
  on public.dashboard_preferences for update to authenticated
  using (user_id = auth.uid() and private.current_account_active())
  with check (
    user_id = auth.uid()
    and private.current_account_active()
    and exists (
      select 1 from public.group_memberships membership
      join public.protocol_versions protocol
        on protocol.id = dashboard_preferences.protocol_version_id
        and protocol.group_id = dashboard_preferences.group_id
        and protocol.state in ('published', 'locked')
      where membership.user_id = auth.uid()
        and membership.group_id = dashboard_preferences.group_id
        and membership.status = 'active'
    )
  );

revoke all on table public.dashboard_preferences from anon, authenticated;
grant select, insert, update on table public.dashboard_preferences to authenticated;

alter table public.profiles
  drop column preferred_group_id,
  drop column preferred_protocol_version_id,
  drop column preferred_dashboard_view;
