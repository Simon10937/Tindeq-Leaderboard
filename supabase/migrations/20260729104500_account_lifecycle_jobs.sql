alter table public.account_deletion_jobs drop constraint account_deletion_jobs_user_id_fkey;
alter table public.account_deletion_jobs add constraint account_deletion_jobs_phase_check
  check (phase in ('revoke', 'evidence', 'database', 'identity', 'complete'));
alter table public.account_deletion_jobs add column worker_id uuid;

alter table public.groups add column creator_tombstone uuid;
alter table public.groups alter column created_by drop not null;
alter table public.groups drop constraint groups_created_by_fkey;
alter table public.groups add constraint groups_created_by_fkey foreign key (created_by)
  references public.profiles(id) on delete set null;

create index account_deletion_jobs_due_idx on public.account_deletion_jobs (next_run_at, created_at)
  where status in ('pending', 'retry', 'running');

create or replace function public.claim_account_deletion_jobs(claim_worker uuid, batch_size integer default 5, only_job uuid default null)
returns table(job_id uuid, user_id uuid, phase text, attempts integer)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  if batch_size not between 1 and 10 then raise exception 'invalid_batch_size'; end if;
  delete from public.audit_events where created_at < now() - interval '12 months';
  update public.account_deletion_jobs j set status = 'retry', lease_expires_at = null, worker_id = null, updated_at = now()
    where j.status = 'running' and j.lease_expires_at <= now();
  return query
  with candidates as (
    select j.id from public.account_deletion_jobs j
    where j.status in ('pending', 'retry') and j.next_run_at <= now()
      and (only_job is null or j.id = only_job)
    order by j.next_run_at, j.created_at
    for update skip locked limit batch_size
  ), claimed as (
    update public.account_deletion_jobs j set status = 'running', worker_id = claim_worker,
      lease_expires_at = now() + interval '4 minutes', updated_at = now()
    from candidates c where j.id = c.id
    returning j.id, j.user_id, j.phase, j.attempts
  ) select c.id, c.user_id, c.phase, c.attempts from claimed c;
end;
$$;

create or replace function public.checkpoint_account_deletion_job(target_job uuid, claim_worker uuid, expected_phase text, next_phase text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  update public.account_deletion_jobs set phase = next_phase,
    status = case when next_phase = 'complete' then 'complete'::public.deletion_job_status else 'pending'::public.deletion_job_status end,
    attempts = 0, next_run_at = now(), lease_expires_at = null, worker_id = null,
    last_error_code = null, updated_at = now(), completed_at = case when next_phase = 'complete' then now() else null end
  where id = target_job and worker_id = claim_worker and status = 'running' and phase = expected_phase;
  if not found then raise exception 'stale_job_lease'; end if;
end;
$$;

create or replace function public.fail_account_deletion_job(target_job uuid, claim_worker uuid, error_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare next_attempt integer;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select attempts + 1 into next_attempt from public.account_deletion_jobs
    where id = target_job and worker_id = claim_worker and status = 'running' for update;
  if next_attempt is null then raise exception 'stale_job_lease'; end if;
  update public.account_deletion_jobs set attempts = next_attempt,
    status = case when next_attempt >= 8 then 'manual_review'::public.deletion_job_status else 'retry'::public.deletion_job_status end,
    next_run_at = now() + make_interval(secs => least(21600, 30 * power(2, least(next_attempt, 9))::integer)),
    lease_expires_at = null, worker_id = null, last_error_code = left(error_code, 80), updated_at = now()
  where id = target_job;
end;
$$;

create or replace function public.delete_account_database_data(target_job uuid, claim_worker uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_user uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  select user_id into target_user from public.account_deletion_jobs
    where id = target_job and worker_id = claim_worker and status = 'running' and phase = 'database' for update;
  if target_user is null then raise exception 'stale_job_lease'; end if;
  update public.audit_events set actor_tombstone = coalesce(actor_tombstone, gen_random_uuid()), actor_id = null
    where actor_id = target_user;
  update public.groups set creator_tombstone = coalesce(creator_tombstone, gen_random_uuid()), created_by = null
    where created_by = target_user;
  delete from public.group_invitations where invited_by = target_user or redeemed_by = target_user;
  delete from public.profiles where id = target_user;
  update public.account_deletion_jobs set phase = 'identity', status = 'pending', attempts = 0,
    next_run_at = now(), lease_expires_at = null, worker_id = null, last_error_code = null, updated_at = now()
    where id = target_job;
end;
$$;

create or replace function public.replay_account_deletion_job(target_job uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden'; end if;
  update public.account_deletion_jobs set status = 'retry', attempts = 0, next_run_at = now(),
    lease_expires_at = null, worker_id = null, last_error_code = null, updated_at = now()
  where id = target_job and status = 'manual_review';
  if not found then raise exception 'job_not_replayable'; end if;
end;
$$;

revoke all on function public.claim_account_deletion_jobs(uuid, integer, uuid),
  public.checkpoint_account_deletion_job(uuid, uuid, text, text),
  public.fail_account_deletion_job(uuid, uuid, text), public.delete_account_database_data(uuid, uuid),
  public.replay_account_deletion_job(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_account_deletion_jobs(uuid, integer, uuid),
  public.checkpoint_account_deletion_job(uuid, uuid, text, text),
  public.fail_account_deletion_job(uuid, uuid, text), public.delete_account_database_data(uuid, uuid),
  public.replay_account_deletion_job(uuid)
  to service_role;
