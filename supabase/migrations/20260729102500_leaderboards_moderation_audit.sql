create or replace view public.leaderboard_entries with (security_invoker = true) as
select
  p.session_id,
  p.group_id,
  p.owner_id,
  profiles.display_name,
  p.protocol_version_id,
  f.name as protocol_name,
  f.assessment_type,
  p.hand,
  p.attempt_id,
  p.metric_run_id,
  m.primary_metric as absolute_score,
  m.relative_metric as relative_score,
  p.authoritative_captured_at,
  p.trust_status,
  p.published_at
from public.group_publications p
join public.metric_runs m on m.id = p.metric_run_id and m.is_current and m.oracle_approved
join public.protocol_versions v on v.id = p.protocol_version_id
join public.protocol_families f on f.id = v.family_id
join public.profiles on profiles.id = p.owner_id and profiles.status = 'active'
join public.group_memberships gm on gm.group_id = p.group_id and gm.user_id = p.owner_id and gm.status = 'active'
join public.assessment_attempts a on a.id = p.attempt_id
where a.ingestion_status = 'ready' and a.inclusion_status = 'included' and a.moderation_status = 'clear';

create policy force_traces_group_read on public.force_traces for select to authenticated using (
  private.current_account_active() and exists (
    select 1 from public.group_publications p
    join public.group_memberships published_member on published_member.group_id = p.group_id
      and published_member.user_id = p.owner_id and published_member.status = 'active'
    where p.attempt_id = force_traces.attempt_id
      and private.has_group_role(p.group_id, array['owner','admin','member']::public.group_role[])
  )
);

create or replace view public.group_trace_curves with (security_invoker = true) as
select p.group_id, p.protocol_version_id, p.hand, p.owner_id, p.session_id, p.attempt_id,
  t.elapsed_us, t.force_n, t.sample_count, t.duration_us
from public.group_publications p
join public.force_traces t on t.attempt_id = p.attempt_id;

create type public.review_status as enum ('active', 'closed', 'expired');

create table public.source_reviews (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 8 and 500),
  status public.review_status not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  closed_at timestamptz,
  check (expires_at > created_at)
);

create index source_reviews_active_idx on public.source_reviews (reviewer_id, attempt_id, expires_at)
  where status = 'active';

alter table public.audit_events drop constraint audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'group.created', 'membership.joined', 'membership.left', 'membership.removed',
  'invitation.created', 'invitation.redeemed', 'invitation.revoked',
  'role.changed', 'account.deletion_requested', 'protocol.created', 'protocol.published',
  'protocol.cloned', 'protocol.archived', 'source.review_started', 'source.reviewed',
  'attempt.invalidated', 'attempt.restored', 'attempt.verified'
));
alter table public.audit_events drop constraint audit_events_target_type_check;
alter table public.audit_events add constraint audit_events_target_type_check
  check (target_type in ('group', 'membership', 'invitation', 'account', 'protocol', 'attempt', 'source_review'));

create or replace function public.start_source_review(target_attempt uuid, review_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare attempt public.assessment_attempts%rowtype; group_id uuid; review_id uuid;
begin
  select a.* into attempt from public.assessment_attempts a where a.id = target_attempt;
  select s.group_id into group_id from public.assessment_sessions s where s.id = attempt.session_id;
  if attempt.id is null or not private.has_group_role(group_id, array['owner','admin']::public.group_role[])
    then raise exception 'forbidden'; end if;
  if char_length(btrim(review_reason)) not between 8 and 500 then raise exception 'reason_required'; end if;
  insert into public.source_reviews (group_id, attempt_id, reviewer_id, reason)
    values (group_id, target_attempt, auth.uid(), btrim(review_reason)) returning id into review_id;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (group_id, auth.uid(), 'source.review_started', 'source_review', review_id);
  return review_id;
end;
$$;

create or replace function public.moderate_attempt(target_attempt uuid, action text, action_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare attempt public.assessment_attempts%rowtype; group_id uuid; audit_event_name text;
begin
  select a.* into attempt from public.assessment_attempts a where a.id = target_attempt for update;
  select s.group_id into group_id from public.assessment_sessions s where s.id = attempt.session_id;
  if attempt.id is null or not private.has_group_role(group_id, array['owner','admin']::public.group_role[])
    then raise exception 'forbidden'; end if;
  if char_length(btrim(action_reason)) not between 8 and 500 then raise exception 'reason_required'; end if;
  if action = 'invalidate' then
    update public.assessment_attempts set moderation_status = 'invalidated', updated_at = now() where id = target_attempt;
    audit_event_name := 'attempt.invalidated';
  elsif action = 'restore' then
    update public.assessment_attempts set moderation_status = 'clear', updated_at = now() where id = target_attempt;
    audit_event_name := 'attempt.restored';
  elsif action = 'verify' then
    if not exists (
      select 1 from public.source_reviews r
      where r.attempt_id = target_attempt and r.reviewer_id = auth.uid() and r.status = 'closed'
    ) then raise exception 'matching_source_review_required'; end if;
    update public.assessment_attempts set trust_status = 'admin_verified', updated_at = now() where id = target_attempt;
    update public.group_publications set trust_status = 'admin_verified' where attempt_id = target_attempt;
    audit_event_name := 'attempt.verified';
  else raise exception 'unsupported_action'; end if;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (group_id, auth.uid(), audit_event_name, 'attempt', target_attempt);
end;
$$;

create or replace function public.list_group_moderation(target_group uuid)
returns table(
  attempt_id uuid, owner_display_name text, protocol_name text, hand public.hand_side,
  declared_test_at timestamptz, ingestion_status public.ingestion_status,
  moderation_status public.moderation_status, trust_status public.trust_status,
  primary_metric double precision, relative_metric double precision
) language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_group_role(target_group, array['owner','admin']::public.group_role[])
    then raise exception 'forbidden'; end if;
  return query
  select a.id, p.display_name, f.name, s.hand, s.declared_test_at, a.ingestion_status,
    a.moderation_status, a.trust_status, m.primary_metric, m.relative_metric
  from public.assessment_attempts a
  join public.assessment_sessions s on s.id = a.session_id and s.group_id = target_group
  join public.profiles p on p.id = a.owner_id
  join public.protocol_versions v on v.id = s.protocol_version_id
  join public.protocol_families f on f.id = v.family_id
  left join public.metric_runs m on m.attempt_id = a.id and m.is_current
  order by s.declared_test_at desc, a.ordinal;
end;
$$;

create or replace function public.resolve_source_review(target_review uuid)
returns table(object_path text, original_filename text)
language plpgsql security definer set search_path = '' as $$
declare review public.source_reviews%rowtype;
begin
  select r.* into review from public.source_reviews r
  where r.id = target_review and r.reviewer_id = auth.uid() and r.status = 'active'
    and r.expires_at > now()
    and private.has_group_role(r.group_id, array['owner','admin']::public.group_role[])
  for update;
  if review.id is null then raise exception 'review_unavailable'; end if;

  return query
  select a.object_path, a.original_filename
  from public.assessment_attempts a where a.id = review.attempt_id;
  update public.source_reviews set status = 'closed', closed_at = now() where id = review.id;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (review.group_id, auth.uid(), 'source.reviewed', 'source_review', review.id);
end;
$$;

revoke all on function public.start_source_review(uuid, text), public.moderate_attempt(uuid, text, text),
  public.list_group_moderation(uuid), public.resolve_source_review(uuid) from public, anon;
grant execute on function public.start_source_review(uuid, text), public.moderate_attempt(uuid, text, text),
  public.list_group_moderation(uuid), public.resolve_source_review(uuid) to authenticated;

alter table public.source_reviews enable row level security;
create policy source_reviews_admin_read on public.source_reviews for select to authenticated
  using (reviewer_id = auth.uid() and private.has_group_role(group_id, array['owner','admin']::public.group_role[]));

revoke all on table public.source_reviews from anon, authenticated;
grant select on public.source_reviews to authenticated;
grant select on public.leaderboard_entries, public.group_trace_curves to authenticated;

create or replace view public.group_audit_events with (security_invoker = true) as
select id, group_id, coalesce(actor_tombstone, actor_id) as actor_reference,
  event_type, target_type, target_id, date_trunc('minute', created_at) as occurred_at
from public.audit_events;

grant select on public.group_audit_events to authenticated;
