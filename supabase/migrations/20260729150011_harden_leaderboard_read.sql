create or replace function private.list_leaderboard_entries(
  target_group uuid,
  target_protocol_version uuid,
  target_hand public.hand_side
)
returns table(
  session_id uuid,
  group_id uuid,
  owner_id uuid,
  display_name text,
  protocol_version_id uuid,
  protocol_name text,
  assessment_type public.assessment_type,
  hand public.hand_side,
  attempt_id uuid,
  metric_run_id uuid,
  absolute_score double precision,
  relative_score double precision,
  authoritative_captured_at timestamptz,
  trust_status public.trust_status,
  published_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_group_role(
    target_group,
    array['owner','admin','member']::public.group_role[]
  ) then
    raise exception 'forbidden';
  end if;

  return query
  select
    publication.session_id,
    publication.group_id,
    publication.owner_id,
    profile.display_name,
    publication.protocol_version_id,
    family.name,
    family.assessment_type,
    publication.hand,
    publication.attempt_id,
    publication.metric_run_id,
    metric.primary_metric,
    metric.relative_metric,
    publication.authoritative_captured_at,
    publication.trust_status,
    publication.published_at
  from public.group_publications publication
  join public.metric_runs metric
    on metric.id = publication.metric_run_id
    and metric.is_current
    and metric.oracle_approved
  join public.protocol_versions version on version.id = publication.protocol_version_id
  join public.protocol_families family on family.id = version.family_id
  join public.profiles profile
    on profile.id = publication.owner_id
    and profile.status = 'active'
  join public.group_memberships published_member
    on published_member.group_id = publication.group_id
    and published_member.user_id = publication.owner_id
    and published_member.status = 'active'
  join public.assessment_attempts attempt on attempt.id = publication.attempt_id
  where publication.group_id = target_group
    and publication.protocol_version_id = target_protocol_version
    and publication.hand = target_hand
    and attempt.ingestion_status = 'ready'
    and attempt.inclusion_status = 'included'
    and attempt.moderation_status = 'clear';
end;
$$;

revoke all on function private.list_leaderboard_entries(uuid, uuid, public.hand_side)
  from public, anon, authenticated;
grant execute on function private.list_leaderboard_entries(uuid, uuid, public.hand_side)
  to authenticated;

create or replace function public.list_leaderboard_entries(
  target_group uuid,
  target_protocol_version uuid,
  target_hand public.hand_side
)
returns table(
  session_id uuid,
  group_id uuid,
  owner_id uuid,
  display_name text,
  protocol_version_id uuid,
  protocol_name text,
  assessment_type public.assessment_type,
  hand public.hand_side,
  attempt_id uuid,
  metric_run_id uuid,
  absolute_score double precision,
  relative_score double precision,
  authoritative_captured_at timestamptz,
  trust_status public.trust_status,
  published_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.list_leaderboard_entries(
    target_group,
    target_protocol_version,
    target_hand
  )
$$;

revoke all on function public.list_leaderboard_entries(uuid, uuid, public.hand_side)
  from public, anon, authenticated;
grant execute on function public.list_leaderboard_entries(uuid, uuid, public.hand_side)
  to authenticated;
