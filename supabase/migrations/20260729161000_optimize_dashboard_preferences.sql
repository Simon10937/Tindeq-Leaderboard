create index dashboard_preferences_group_idx on public.dashboard_preferences (group_id);
create index dashboard_preferences_protocol_idx on public.dashboard_preferences (protocol_version_id);

drop policy dashboard_preferences_select_self on public.dashboard_preferences;
drop policy dashboard_preferences_insert_self on public.dashboard_preferences;
drop policy dashboard_preferences_update_self on public.dashboard_preferences;

create policy dashboard_preferences_select_self
  on public.dashboard_preferences for select to authenticated
  using (user_id = (select auth.uid()) and private.current_account_active());

create policy dashboard_preferences_insert_self
  on public.dashboard_preferences for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.current_account_active()
    and exists (
      select 1 from public.group_memberships membership
      join public.protocol_versions protocol
        on protocol.id = dashboard_preferences.protocol_version_id
        and protocol.group_id = dashboard_preferences.group_id
        and protocol.state in ('published', 'locked')
      where membership.user_id = (select auth.uid())
        and membership.group_id = dashboard_preferences.group_id
        and membership.status = 'active'
    )
  );

create policy dashboard_preferences_update_self
  on public.dashboard_preferences for update to authenticated
  using (user_id = (select auth.uid()) and private.current_account_active())
  with check (
    user_id = (select auth.uid())
    and private.current_account_active()
    and exists (
      select 1 from public.group_memberships membership
      join public.protocol_versions protocol
        on protocol.id = dashboard_preferences.protocol_version_id
        and protocol.group_id = dashboard_preferences.group_id
        and protocol.state in ('published', 'locked')
      where membership.user_id = (select auth.uid())
        and membership.group_id = dashboard_preferences.group_id
        and membership.status = 'active'
    )
  );
