create type public.assessment_type as enum ('rfd', 'max_pull', 'critical_force', 'repeaters');
create type public.protocol_state as enum ('draft', 'published', 'locked', 'archived');

create table public.assessment_capabilities (
  assessment_type public.assessment_type primary key,
  enabled boolean not null default false,
  parser_version text,
  algorithm_version text,
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not enabled or (parser_version is not null and algorithm_version is not null and enabled_at is not null))
);

insert into public.assessment_capabilities (assessment_type, enabled, parser_version, algorithm_version, enabled_at)
values
  ('rfd', false, 'tindeq-rfd-csv/v1', 'rfd-20-80/v1', null),
  ('max_pull', false, null, null, null),
  ('critical_force', false, null, null, null),
  ('repeaters', false, null, null, null);

create table public.protocol_families (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  assessment_type public.assessment_type not null,
  name text not null check (char_length(btrim(name)) between 3 and 100),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id, group_id)
);

create index protocol_families_group_type_idx on public.protocol_families (group_id, assessment_type, created_at desc);

create table public.protocol_versions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  group_id uuid not null,
  version integer not null check (version > 0),
  state public.protocol_state not null default 'draft',
  grip_type text not null check (grip_type in ('open_hand','half_crimp','full_crimp','three_finger_drag','pinch','other')),
  edge_depth_mm numeric(6,2) not null check (edge_depth_mm > 0 and edge_depth_mm <= 100),
  setup_instructions text not null check (char_length(btrim(setup_instructions)) >= 8),
  warmup_instructions text not null check (char_length(btrim(warmup_instructions)) >= 8),
  body_position text not null check (char_length(btrim(body_position)) >= 8),
  device_placement text not null check (char_length(btrim(device_placement)) >= 8),
  execution_instructions text not null check (char_length(btrim(execution_instructions)) >= 8),
  maximum_attempts integer not null check (maximum_attempts between 1 and 10),
  minimum_recovery_seconds integer not null check (minimum_recovery_seconds between 0 and 3600),
  best_of integer not null check (best_of between 1 and maximum_attempts),
  minimum_valid_duration_ms integer not null check (minimum_valid_duration_ms between 100 and 60000),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  locked_at timestamptz,
  archived_at timestamptz,
  unique (family_id, version),
  unique (id, group_id),
  foreign key (family_id, group_id) references public.protocol_families(id, group_id) on delete restrict,
  check (
    (state = 'draft' and published_at is null and locked_at is null and archived_at is null) or
    (state = 'published' and published_at is not null and locked_at is null and archived_at is null) or
    (state = 'locked' and published_at is not null and locked_at is not null and archived_at is null) or
    (state = 'archived' and published_at is not null and archived_at is not null)
  )
);

create index protocol_versions_group_state_idx on public.protocol_versions (group_id, state, created_at desc);

create or replace function private.guard_protocol_version_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.state <> 'draft' then
    if row(new.family_id, new.group_id, new.version, new.grip_type, new.edge_depth_mm,
      new.setup_instructions, new.warmup_instructions, new.body_position, new.device_placement,
      new.execution_instructions, new.maximum_attempts, new.minimum_recovery_seconds,
      new.best_of, new.minimum_valid_duration_ms, new.settings)
      is distinct from
      row(old.family_id, old.group_id, old.version, old.grip_type, old.edge_depth_mm,
      old.setup_instructions, old.warmup_instructions, old.body_position, old.device_placement,
      old.execution_instructions, old.maximum_attempts, old.minimum_recovery_seconds,
      old.best_of, old.minimum_valid_duration_ms, old.settings)
    then raise exception 'published_protocol_is_immutable'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_protocol_version_mutation() from public, anon, authenticated;

create trigger guard_protocol_version_mutation before update on public.protocol_versions
for each row execute function private.guard_protocol_version_mutation();

create or replace function public.create_rfd_protocol(target_group uuid, draft jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare family_id uuid; version_id uuid;
begin
  if not private.has_group_role(target_group, array['owner','admin']::public.group_role[])
    then raise exception 'forbidden'; end if;
  if (draft ->> 'lowerPercent')::numeric <> 20
    or (draft ->> 'upperPercent')::numeric <> 80
    or (draft ->> 'minimumPeakForceN')::numeric <= 0
    then raise exception 'invalid_rfd_settings'; end if;
  insert into public.protocol_families (group_id, assessment_type, name, created_by)
  values (target_group, 'rfd', draft ->> 'name', auth.uid()) returning id into family_id;
  insert into public.protocol_versions (
    family_id, group_id, version, grip_type, edge_depth_mm, setup_instructions,
    warmup_instructions, body_position, device_placement, execution_instructions,
    maximum_attempts, minimum_recovery_seconds, best_of, minimum_valid_duration_ms,
    settings, created_by
  ) values (
    family_id, target_group, 1, draft ->> 'gripType', (draft ->> 'edgeDepthMm')::numeric,
    draft ->> 'setupInstructions', draft ->> 'warmupInstructions', draft ->> 'bodyPosition',
    draft ->> 'devicePlacement', draft ->> 'executionInstructions',
    (draft ->> 'maximumAttempts')::integer, (draft ->> 'minimumRecoverySeconds')::integer,
    (draft ->> 'bestOf')::integer, (draft ->> 'minimumValidDurationMs')::integer,
    jsonb_build_object(
      'lowerPercent', (draft ->> 'lowerPercent')::numeric,
      'upperPercent', (draft ->> 'upperPercent')::numeric,
      'minimumPeakForceN', (draft ->> 'minimumPeakForceN')::numeric
    ), auth.uid()
  ) returning id into version_id;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (target_group, auth.uid(), 'protocol.created', 'protocol', version_id);
  return version_id;
end;
$$;

revoke all on function public.create_rfd_protocol(uuid, jsonb) from public, anon;
grant execute on function public.create_rfd_protocol(uuid, jsonb) to authenticated;

create or replace function public.publish_protocol_version(target_version uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.protocol_versions%rowtype; target_type public.assessment_type;
begin
  select v.* into target from public.protocol_versions v where v.id = target_version for update;
  if target.id is null or not private.has_group_role(target.group_id, array['owner','admin']::public.group_role[])
    then raise exception 'forbidden'; end if;
  select assessment_type into target_type from public.protocol_families where id = target.family_id;
  if not exists (select 1 from public.assessment_capabilities c where c.assessment_type = target_type and c.enabled)
    then raise exception 'assessment_not_enabled'; end if;
  if target.state <> 'draft' then raise exception 'protocol_not_draft'; end if;
  update public.protocol_versions set state = 'published', published_at = now() where id = target.id;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (target.group_id, auth.uid(), 'protocol.published', 'protocol', target.id);
end;
$$;

create or replace function public.clone_protocol_version(target_version uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare source public.protocol_versions%rowtype; new_id uuid; next_version integer;
begin
  select v.* into source from public.protocol_versions v where v.id = target_version;
  if source.id is null or not private.has_group_role(source.group_id, array['owner','admin']::public.group_role[])
    then raise exception 'forbidden'; end if;
  select coalesce(max(v.version), 0) + 1 into next_version from public.protocol_versions v where v.family_id = source.family_id;
  insert into public.protocol_versions (
    family_id, group_id, version, grip_type, edge_depth_mm, setup_instructions, warmup_instructions,
    body_position, device_placement, execution_instructions, maximum_attempts, minimum_recovery_seconds,
    best_of, minimum_valid_duration_ms, settings, created_by
  ) values (
    source.family_id, source.group_id, next_version, source.grip_type, source.edge_depth_mm,
    source.setup_instructions, source.warmup_instructions, source.body_position, source.device_placement,
    source.execution_instructions, source.maximum_attempts, source.minimum_recovery_seconds,
    source.best_of, source.minimum_valid_duration_ms, source.settings, auth.uid()
  ) returning id into new_id;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (source.group_id, auth.uid(), 'protocol.cloned', 'protocol', new_id);
  return new_id;
end;
$$;

create or replace function public.archive_protocol_version(target_version uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.protocol_versions%rowtype;
begin
  select v.* into target from public.protocol_versions v where v.id = target_version for update;
  if target.id is null or not private.has_group_role(target.group_id, array['owner','admin']::public.group_role[])
    then raise exception 'forbidden'; end if;
  if target.state not in ('published', 'locked') then raise exception 'protocol_not_archivable'; end if;
  update public.protocol_versions set state = 'archived', archived_at = now() where id = target.id;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (target.group_id, auth.uid(), 'protocol.archived', 'protocol', target.id);
end;
$$;

revoke all on function public.publish_protocol_version(uuid) from public, anon;
grant execute on function public.publish_protocol_version(uuid) to authenticated;
revoke all on function public.clone_protocol_version(uuid), public.archive_protocol_version(uuid) from public, anon;
grant execute on function public.clone_protocol_version(uuid), public.archive_protocol_version(uuid) to authenticated;

alter table public.audit_events drop constraint audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'group.created', 'group.deleted', 'membership.joined', 'membership.left', 'membership.removed',
  'invitation.created', 'invitation.redeemed', 'invitation.revoked',
  'role.changed', 'account.deletion_requested', 'protocol.created', 'protocol.published',
  'protocol.cloned', 'protocol.archived'
));
alter table public.audit_events drop constraint audit_events_target_type_check;
alter table public.audit_events add constraint audit_events_target_type_check
  check (target_type in ('group', 'membership', 'invitation', 'account', 'protocol'));

alter table public.assessment_capabilities enable row level security;
alter table public.protocol_families enable row level security;
alter table public.protocol_versions enable row level security;

create policy assessment_capabilities_read on public.assessment_capabilities for select to authenticated
  using (private.current_account_active());
create policy protocol_families_read on public.protocol_families for select to authenticated
  using (private.has_group_role(group_id, array['owner','admin','member']::public.group_role[]));
create policy protocol_families_insert on public.protocol_families for insert to authenticated
  with check (created_by = auth.uid() and private.has_group_role(group_id, array['owner','admin']::public.group_role[]));
create policy protocol_families_update on public.protocol_families for update to authenticated
  using (private.has_group_role(group_id, array['owner','admin']::public.group_role[]))
  with check (private.has_group_role(group_id, array['owner','admin']::public.group_role[]));
create policy protocol_versions_read on public.protocol_versions for select to authenticated
  using (private.has_group_role(group_id, array['owner','admin','member']::public.group_role[]));
create policy protocol_versions_insert on public.protocol_versions for insert to authenticated
  with check (created_by = auth.uid() and private.has_group_role(group_id, array['owner','admin']::public.group_role[]));
create policy protocol_versions_update on public.protocol_versions for update to authenticated
  using (private.has_group_role(group_id, array['owner','admin']::public.group_role[]))
  with check (private.has_group_role(group_id, array['owner','admin']::public.group_role[]));

revoke all on table public.assessment_capabilities, public.protocol_families, public.protocol_versions from anon, authenticated;
grant select on public.assessment_capabilities to authenticated;
grant select on public.protocol_families, public.protocol_versions to authenticated;
