create type public.hand_side as enum ('left', 'right');
create type public.manifest_status as enum ('draft', 'processing', 'ready', 'published');
create type public.ingestion_status as enum ('pending', 'processing', 'ready', 'rejected');
create type public.inclusion_status as enum ('included', 'excluded');
create type public.moderation_status as enum ('clear', 'invalidated');
create type public.trust_status as enum ('self_attested', 'admin_verified');

create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  protocol_version_id uuid not null,
  hand public.hand_side not null,
  declared_test_at timestamptz not null,
  declared_timezone text not null check (char_length(declared_timezone) between 1 and 100),
  body_weight_n double precision check (body_weight_n is null or body_weight_n > 0),
  protocol_adherence_confirmed boolean not null check (protocol_adherence_confirmed),
  status public.manifest_status not null default 'draft',
  expected_attempts integer not null check (expected_attempts between 1 and 10),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (id, owner_id),
  unique (id, group_id, owner_id, protocol_version_id, hand),
  check (declared_test_at >= timestamptz '2000-01-01'),
  foreign key (protocol_version_id, group_id) references public.protocol_versions(id, group_id) on delete restrict
);

create index assessment_sessions_owner_date_idx on public.assessment_sessions (owner_id, declared_test_at desc);
create index assessment_sessions_group_protocol_idx on public.assessment_sessions (group_id, protocol_version_id, hand, declared_test_at desc);

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  owner_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 10),
  object_path text not null unique check (object_path ~ '^[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]+\.csv$'),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[A-F0-9]{64}$'),
  source_size_bytes integer check (source_size_bytes is null or source_size_bytes between 1 and 5242880),
  ingestion_status public.ingestion_status not null default 'pending',
  inclusion_status public.inclusion_status not null default 'included',
  moderation_status public.moderation_status not null default 'clear',
  trust_status public.trust_status not null default 'self_attested',
  export_captured_at timestamptz,
  export_timezone text,
  timestamp_exception_reason text,
  parser_version text,
  vendor_payload jsonb,
  failure_code text,
  processing_claimed_at timestamptz,
  processing_lease_expires_at timestamptz,
  processing_token uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, ordinal),
  unique (owner_id, source_sha256),
  unique (id, session_id, owner_id),
  foreign key (session_id, owner_id) references public.assessment_sessions(id, owner_id) on delete cascade
);

create index assessment_attempts_session_status_idx on public.assessment_attempts (session_id, ingestion_status, inclusion_status);
create index assessment_attempts_processing_lease_idx on public.assessment_attempts (processing_lease_expires_at)
  where ingestion_status = 'processing';

create table public.force_traces (
  attempt_id uuid primary key references public.assessment_attempts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  elapsed_us bigint[] not null,
  force_n double precision[] not null,
  sample_count integer not null check (sample_count >= 2),
  duration_us bigint not null check (duration_us > 0),
  created_at timestamptz not null default now(),
  unique (attempt_id, owner_id),
  check (cardinality(elapsed_us) = sample_count and cardinality(force_n) = sample_count)
);

create table public.metric_runs (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  assessment_type public.assessment_type not null,
  parser_version text not null,
  algorithm_version text not null,
  primary_metric double precision not null check (primary_metric > '-Infinity'::double precision and primary_metric < 'Infinity'::double precision),
  relative_metric double precision check (relative_metric is null or (relative_metric > '-Infinity'::double precision and relative_metric < 'Infinity'::double precision)),
  calculation_payload jsonb not null check (jsonb_typeof(calculation_payload) = 'object'),
  oracle_approved boolean not null default false,
  supersedes_id uuid references public.metric_runs(id),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (attempt_id, parser_version, algorithm_version)
);
alter table public.metric_runs add constraint metric_runs_id_attempt_owner_key unique (id, attempt_id, owner_id);

create unique index metric_runs_current_attempt_idx on public.metric_runs (attempt_id) where is_current;

create table public.group_publications (
  session_id uuid primary key references public.assessment_sessions(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  protocol_version_id uuid not null,
  hand public.hand_side not null,
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  metric_run_id uuid not null references public.metric_runs(id) on delete cascade,
  authoritative_captured_at timestamptz not null,
  trust_status public.trust_status not null,
  published_at timestamptz not null default now(),
  foreign key (protocol_version_id, group_id) references public.protocol_versions(id, group_id) on delete restrict
  ,foreign key (session_id, group_id, owner_id, protocol_version_id, hand)
    references public.assessment_sessions(id, group_id, owner_id, protocol_version_id, hand) on delete cascade
  ,foreign key (attempt_id, session_id, owner_id)
    references public.assessment_attempts(id, session_id, owner_id) on delete cascade
  ,foreign key (metric_run_id, attempt_id, owner_id)
    references public.metric_runs(id, attempt_id, owner_id) on delete cascade
);

create index group_publications_leaderboard_idx
  on public.group_publications (group_id, protocol_version_id, hand, authoritative_captured_at desc);

create or replace function public.create_assessment_manifest(
  target_group uuid,
  target_protocol_version uuid,
  comparison_hand public.hand_side,
  declared_at timestamptz,
  declared_timezone text,
  body_weight_newtons double precision,
  adherence_confirmed boolean,
  files jsonb
) returns table(session_id uuid, attempt_id uuid, ordinal integer, object_path text)
language plpgsql security definer set search_path = '' as $$
declare
  new_session_id uuid := gen_random_uuid();
  new_attempt_id uuid;
  file_record record;
  file_count integer := jsonb_array_length(files);
  protocol public.protocol_versions%rowtype;
begin
  if not private.current_account_active() or not private.has_group_role(target_group, array['owner','admin','member']::public.group_role[])
    then raise exception 'forbidden'; end if;
  select * into protocol from public.protocol_versions
    where id = target_protocol_version and group_id = target_group and state in ('published','locked');
  if protocol.id is null then raise exception 'protocol_unavailable'; end if;
  if file_count < 1 or file_count > least(10, protocol.maximum_attempts) then raise exception 'invalid_file_count'; end if;
  if not adherence_confirmed then raise exception 'protocol_adherence_required'; end if;
  if body_weight_newtons is not null and body_weight_newtons <= 0 then raise exception 'invalid_body_weight'; end if;
  if declared_at > now() + interval '5 minutes' then raise exception 'invalid_declared_time'; end if;
  if char_length(declared_timezone) not between 1 and 100 then raise exception 'invalid_declared_timezone'; end if;

  insert into public.assessment_sessions (
    id, owner_id, group_id, protocol_version_id, hand, declared_test_at, declared_timezone,
    body_weight_n, protocol_adherence_confirmed, expected_attempts
  ) values (
    new_session_id, auth.uid(), target_group, target_protocol_version, comparison_hand,
    declared_at, declared_timezone, body_weight_newtons, adherence_confirmed, file_count
  );

  for file_record in select value, ordinality from jsonb_array_elements(files) with ordinality loop
    new_attempt_id := gen_random_uuid();
    session_id := new_session_id;
    attempt_id := new_attempt_id;
    ordinal := file_record.ordinality;
    object_path := auth.uid()::text || '/' || target_group::text || '/' || new_session_id::text || '/' || new_attempt_id::text || '.csv';
    insert into public.assessment_attempts (id, session_id, owner_id, ordinal, object_path, original_filename, source_size_bytes)
      values (new_attempt_id, new_session_id, auth.uid(), ordinal, object_path,
        left(file_record.value ->> 'name', 255), (file_record.value ->> 'size')::integer);
    return next;
  end loop;
end;
$$;

revoke all on function public.create_assessment_manifest(uuid, uuid, public.hand_side, timestamptz, text, double precision, boolean, jsonb) from public, anon;
grant execute on function public.create_assessment_manifest(uuid, uuid, public.hand_side, timestamptz, text, double precision, boolean, jsonb) to authenticated;

create or replace function public.publish_assessment_session(target_session uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare session public.assessment_sessions%rowtype; winner record;
begin
  select s.* into session from public.assessment_sessions s where s.id = target_session for update;
  if session.id is null or session.owner_id <> auth.uid() or not private.current_account_active()
    then raise exception 'forbidden'; end if;
  if not private.has_group_role(session.group_id, array['owner','admin','member']::public.group_role[])
    or not exists (select 1 from public.protocol_versions v where v.id = session.protocol_version_id and v.state in ('published','locked'))
    then raise exception 'session_context_unavailable'; end if;
  if session.status = 'published' then return session.id; end if;
  if (select count(*) from public.assessment_attempts a where a.session_id = session.id) <> session.expected_attempts
    or exists (select 1 from public.assessment_attempts a where a.session_id = session.id
      and (a.ingestion_status in ('pending','processing') or (a.ingestion_status = 'rejected' and a.inclusion_status = 'included')))
    then raise exception 'session_unresolved'; end if;
  select a.id as attempt_id, m.id as metric_run_id, a.trust_status
    into winner
  from public.assessment_attempts a join public.metric_runs m on m.attempt_id = a.id
    and m.is_current and m.oracle_approved
  where a.session_id = session.id and a.ingestion_status = 'ready'
    and a.inclusion_status = 'included' and a.moderation_status = 'clear'
  order by m.primary_metric desc, a.ordinal, a.id limit 1;
  if winner.attempt_id is null then raise exception 'no_oracle_approved_attempt'; end if;
  insert into public.group_publications (
    session_id, group_id, owner_id, protocol_version_id, hand, attempt_id,
    metric_run_id, authoritative_captured_at, trust_status
  ) values (
    session.id, session.group_id, session.owner_id, session.protocol_version_id, session.hand,
    winner.attempt_id, winner.metric_run_id, session.declared_test_at, winner.trust_status
  );
  update public.assessment_sessions set status = 'published', published_at = now() where id = session.id;
  return session.id;
end;
$$;

create or replace function public.claim_assessment_attempt(target_attempt uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare claim_token uuid := gen_random_uuid(); claimed_id uuid;
begin
  if not private.current_account_active() then raise exception 'forbidden'; end if;
  update public.assessment_attempts set ingestion_status = 'processing', processing_claimed_at = now(),
    processing_lease_expires_at = now() + interval '2 minutes', processing_token = claim_token, updated_at = now()
  where id = target_attempt and owner_id = auth.uid()
    and exists (select 1 from public.assessment_sessions s where s.id = assessment_attempts.session_id
      and private.has_group_role(s.group_id, array['owner','admin','member']::public.group_role[]))
    and (ingestion_status = 'pending' or (ingestion_status = 'processing' and processing_lease_expires_at <= now()))
  returning id into claimed_id;
  return case when claimed_id is null then null else claim_token end;
end;
$$;

create or replace function public.complete_rfd_attempt(
  target_attempt uuid, claim_token uuid, source_hash text, source_bytes integer,
  parser text, vendor jsonb, trace_elapsed_us bigint[], trace_force_n double precision[],
  algorithm text, primary_score double precision, relative_score double precision,
  calculation jsonb, oracle_is_approved boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare attempt public.assessment_attempts%rowtype; protocol_id uuid; attempt_group uuid; protocol_state public.protocol_state;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select a.* into attempt from public.assessment_attempts a
    where a.id = target_attempt and a.ingestion_status = 'processing' and a.processing_token = claim_token for update;
  if attempt.id is null then raise exception 'stale_processing_claim'; end if;
  select s.protocol_version_id, s.group_id, v.state into protocol_id, attempt_group, protocol_state
    from public.assessment_sessions s join public.protocol_versions v on v.id = s.protocol_version_id
    where s.id = attempt.session_id;
  if protocol_state not in ('published', 'locked') or not exists (
    select 1 from public.group_memberships m where m.group_id = attempt_group and m.user_id = attempt.owner_id and m.status = 'active'
  ) then raise exception 'attempt_context_unavailable'; end if;
  if source_hash !~ '^[A-F0-9]{64}$' or source_bytes not between 1 and 5242880
    then raise exception 'invalid_source'; end if;
  if cardinality(trace_elapsed_us) not between 2 and 100000 or cardinality(trace_elapsed_us) <> cardinality(trace_force_n)
    then raise exception 'invalid_trace'; end if;
  insert into public.force_traces (attempt_id, owner_id, elapsed_us, force_n, sample_count, duration_us)
    values (attempt.id, attempt.owner_id, trace_elapsed_us, trace_force_n, cardinality(trace_elapsed_us), trace_elapsed_us[cardinality(trace_elapsed_us)]);
  insert into public.metric_runs (attempt_id, owner_id, assessment_type, parser_version, algorithm_version,
    primary_metric, relative_metric, calculation_payload, oracle_approved)
    values (attempt.id, attempt.owner_id, 'rfd', parser, algorithm, primary_score, relative_score, calculation, oracle_is_approved);
  update public.assessment_attempts set source_sha256 = source_hash, source_size_bytes = source_bytes,
    ingestion_status = 'ready', parser_version = parser, vendor_payload = vendor, failure_code = null,
    processing_lease_expires_at = null, processing_token = null, updated_at = now()
    where id = attempt.id;
  update public.protocol_versions set state = 'locked', locked_at = now()
    where id = protocol_id and state = 'published';
end;
$$;

create or replace function public.reject_rfd_attempt(target_attempt uuid, claim_token uuid, error_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  update public.assessment_attempts set ingestion_status = 'rejected', failure_code = left(error_code, 80),
    processing_lease_expires_at = null, processing_token = null, updated_at = now()
  where id = target_attempt and ingestion_status = 'processing' and processing_token = claim_token;
  return found;
end;
$$;

create or replace function public.set_attempt_inclusion(target_attempt uuid, new_status public.inclusion_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.current_account_active() then raise exception 'forbidden'; end if;
  update public.assessment_attempts a set inclusion_status = new_status, updated_at = now()
  from public.assessment_sessions s
  where a.id = target_attempt and a.session_id = s.id and a.owner_id = auth.uid()
    and s.status <> 'published' and a.ingestion_status in ('ready', 'rejected');
  if not found then raise exception 'attempt_unavailable'; end if;
end;
$$;

revoke all on function public.publish_assessment_session(uuid) from public, anon;
revoke all on function public.claim_assessment_attempt(uuid), public.set_attempt_inclusion(uuid, public.inclusion_status) from public, anon;
revoke all on function public.complete_rfd_attempt(uuid, uuid, text, integer, text, jsonb, bigint[], double precision[], text, double precision, double precision, jsonb, boolean),
  public.reject_rfd_attempt(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.publish_assessment_session(uuid) to authenticated;
grant execute on function public.claim_assessment_attempt(uuid), public.set_attempt_inclusion(uuid, public.inclusion_status) to authenticated;
grant execute on function public.complete_rfd_attempt(uuid, uuid, text, integer, text, jsonb, bigint[], double precision[], text, double precision, double precision, jsonb, boolean),
  public.reject_rfd_attempt(uuid, uuid, text) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assessment-evidence', 'assessment-evidence', false, 5242880, array['text/csv','text/plain','application/vnd.ms-excel'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.assessment_sessions enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.force_traces enable row level security;
alter table public.metric_runs enable row level security;
alter table public.group_publications enable row level security;

create policy assessment_sessions_owner_all on public.assessment_sessions for all to authenticated
  using (owner_id = auth.uid() and private.current_account_active())
  with check (owner_id = auth.uid() and private.current_account_active()
    and private.has_group_role(group_id, array['owner','admin','member']::public.group_role[]));
create policy assessment_attempts_owner_all on public.assessment_attempts for all to authenticated
  using (owner_id = auth.uid() and private.current_account_active())
  with check (owner_id = auth.uid() and private.current_account_active());
create policy force_traces_owner_read on public.force_traces for select to authenticated
  using (owner_id = auth.uid() and private.current_account_active());
create policy metric_runs_owner_read on public.metric_runs for select to authenticated
  using (owner_id = auth.uid() and private.current_account_active());
create policy publications_group_read on public.group_publications for select to authenticated
  using (private.has_group_role(group_id, array['owner','admin','member']::public.group_role[])
    and exists (
      select 1 from public.group_memberships published_member
      where published_member.group_id = group_publications.group_id
        and published_member.user_id = group_publications.owner_id
        and published_member.status = 'active'
    ));

revoke all on table public.assessment_sessions, public.assessment_attempts, public.force_traces,
  public.metric_runs, public.group_publications from anon, authenticated;
grant select on public.assessment_sessions, public.assessment_attempts to authenticated;
grant select on public.force_traces, public.metric_runs, public.group_publications to authenticated;

create policy evidence_owner_read on storage.objects for select to authenticated using (
  bucket_id = 'assessment-evidence' and (storage.foldername(name))[1] = auth.uid()::text
  and private.current_account_active()
);

-- Browser writes use server-issued signed upload tokens. Authenticated roles have no
-- general INSERT, UPDATE, DELETE, or listing policy for this bucket.
