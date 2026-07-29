create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.account_status as enum ('active', 'deleting');
create type public.group_role as enum ('owner', 'admin', 'member');
create type public.membership_status as enum ('active', 'left', 'removed');
create type public.invitation_status as enum ('pending', 'redeemed', 'revoked', 'expired');
create type public.delivery_status as enum ('queued', 'sent', 'delivered', 'failed', 'bounced');
create type public.deletion_job_status as enum ('pending', 'running', 'retry', 'manual_review', 'complete');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  status public.account_status not null default 'active',
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.group_memberships (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null,
  status public.membership_status not null default 'active',
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (group_id, user_id)
);

create index group_memberships_user_active_idx
  on public.group_memberships (user_id, group_id) where status = 'active';
create index group_memberships_group_active_idx
  on public.group_memberships (group_id, role) where status = 'active';
create unique index group_memberships_one_active_owner_idx
  on public.group_memberships (group_id) where role = 'owner' and status = 'active';

create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized))),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  version integer not null default 1 check (version > 0),
  status public.invitation_status not null default 'pending',
  delivery_status public.delivery_status not null default 'queued',
  provider_email_id text,
  invited_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  redeemed_by uuid references public.profiles(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index group_invitations_pending_email_idx
  on public.group_invitations (group_id, email_normalized)
  where status = 'pending';

create table public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status public.deletion_job_status not null default 'pending',
  phase text not null default 'revoke',
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  group_id uuid references public.groups(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_tombstone uuid,
  event_type text not null check (event_type in (
    'group.created', 'membership.joined', 'membership.left', 'membership.removed',
    'invitation.created', 'invitation.redeemed', 'invitation.revoked',
    'role.changed', 'account.deletion_requested'
  )),
  target_type text not null check (target_type in ('group', 'membership', 'invitation', 'account')),
  target_id uuid,
  target_tombstone uuid,
  created_at timestamptz not null default now()
);

create index audit_events_group_created_idx on public.audit_events (group_id, created_at desc);

create or replace function private.current_account_active(candidate uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = candidate and p.status = 'active' and u.email_confirmed_at is not null
  );
$$;

create or replace function private.has_group_role(target_group uuid, allowed public.group_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_account_active() and exists (
    select 1 from public.group_memberships m join public.groups g on g.id = m.group_id and g.deleted_at is null
    where m.group_id = target_group and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any(allowed)
  );
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_account_active(uuid) to authenticated;
grant execute on function private.has_group_role(uuid, public.group_role[]) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 80));
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_group(group_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_group_id uuid;
begin
  if not private.current_account_active() then raise exception 'account_not_active'; end if;
  if char_length(btrim(group_name)) not between 1 and 80 then raise exception 'invalid_group_name'; end if;
  insert into public.groups (name, created_by) values (btrim(group_name), auth.uid()) returning id into new_group_id;
  insert into public.group_memberships (group_id, user_id, role) values (new_group_id, auth.uid(), 'owner');
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (new_group_id, auth.uid(), 'group.created', 'group', new_group_id);
  return new_group_id;
end;
$$;

create or replace function public.create_group_invitation(
  target_group uuid, invite_email text, invite_token_hash text
) returns table(invitation_id uuid, invitation_version integer, group_name text)
language plpgsql security definer set search_path = '' as $$
declare normalized_email text := lower(btrim(invite_email));
begin
  if not private.has_group_role(target_group, array['owner','admin']::public.group_role[]) then raise exception 'forbidden'; end if;
  if invite_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_token_hash'; end if;
  if exists (
    select 1 from auth.users u join public.group_memberships m on m.user_id = u.id
    where lower(u.email) = normalized_email and m.group_id = target_group and m.status = 'active'
  ) then raise exception 'already_member'; end if;
  update public.group_invitations set status = 'revoked', updated_at = now()
    where group_id = target_group and email_normalized = normalized_email and status = 'pending';
  return query
    with created as (
      insert into public.group_invitations (group_id, email_normalized, token_hash, invited_by, expires_at)
      values (target_group, normalized_email, invite_token_hash, auth.uid(), now() + interval '7 days')
      returning id, version
    )
    select created.id, created.version, g.name from created join public.groups g on g.id = target_group;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    select target_group, auth.uid(), 'invitation.created', 'invitation', i.id
    from public.group_invitations i where i.group_id = target_group and i.token_hash = invite_token_hash;
end;
$$;

create or replace function public.redeem_group_invitation(raw_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.group_invitations%rowtype; current_email text;
begin
  if not private.current_account_active() then raise exception 'account_not_active'; end if;
  select lower(email) into current_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  select * into invitation from public.group_invitations
    where token_hash = encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'), 'hex')
    for update;
  if invitation.id is null or invitation.status <> 'pending' then raise exception 'invitation_unavailable'; end if;
  if invitation.expires_at <= now() then raise exception 'invitation_expired'; end if;
  if current_email is distinct from invitation.email_normalized then raise exception 'invitation_email_mismatch'; end if;
  if exists (select 1 from public.group_memberships where group_id = invitation.group_id and user_id = auth.uid() and status = 'active')
    then raise exception 'already_member'; end if;
  insert into public.group_memberships (group_id, user_id, role, status, ended_at)
    values (invitation.group_id, auth.uid(), 'member', 'active', null)
    on conflict (group_id, user_id) do update set role = 'member', status = 'active', ended_at = null, joined_at = now();
  update public.group_invitations set status = 'redeemed', redeemed_by = auth.uid(), redeemed_at = now(), updated_at = now()
    where id = invitation.id;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (invitation.group_id, auth.uid(), 'invitation.redeemed', 'invitation', invitation.id);
  return invitation.group_id;
end;
$$;

create or replace function public.record_invitation_delivery(
  target_invitation uuid, new_status public.delivery_status, external_email_id text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare invitation public.group_invitations%rowtype;
begin
  select * into invitation from public.group_invitations where id = target_invitation for update;
  if invitation.id is null or invitation.invited_by <> auth.uid()
    or not private.has_group_role(invitation.group_id, array['owner','admin']::public.group_role[])
  then raise exception 'forbidden'; end if;
  update public.group_invitations set delivery_status = new_status,
    provider_email_id = coalesce(external_email_id, provider_email_id), updated_at = now()
    where id = target_invitation;
end;
$$;

create or replace function public.leave_group(target_group uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_group_role(target_group, array['admin','member']::public.group_role[]) then raise exception 'cannot_leave'; end if;
  update public.group_memberships set status = 'left', ended_at = now()
    where group_id = target_group and user_id = auth.uid() and status = 'active';
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (target_group, auth.uid(), 'membership.left', 'membership', auth.uid());
end;
$$;

create or replace function public.delete_group(target_group uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_group_role(target_group, array['owner']::public.group_role[]) then raise exception 'forbidden'; end if;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (target_group, auth.uid(), 'group.deleted', 'group', target_group);
  update public.groups set deleted_at = now() where id = target_group and deleted_at is null;
  update public.group_memberships set status = 'removed', ended_at = now()
    where group_id = target_group and status = 'active';
  update public.group_invitations set status = 'revoked', updated_at = now()
    where group_id = target_group and status = 'pending';
end;
$$;

create or replace function public.remove_group_member(target_group uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target_role public.group_role;
begin
  if not private.has_group_role(target_group, array['owner','admin']::public.group_role[]) then raise exception 'forbidden'; end if;
  select role into target_role from public.group_memberships where group_id = target_group and user_id = target_user and status = 'active' for update;
  if target_role is null or target_role = 'owner' or (target_role = 'admin' and not private.has_group_role(target_group, array['owner']::public.group_role[])) then raise exception 'forbidden_target'; end if;
  update public.group_memberships set status = 'removed', ended_at = now() where group_id = target_group and user_id = target_user;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (target_group, auth.uid(), 'membership.removed', 'membership', target_user);
end;
$$;

create or replace function public.change_group_member_role(target_group uuid, target_user uuid, new_role public.group_role)
returns void language plpgsql security definer set search_path = '' as $$
declare current_role public.group_role;
begin
  if not private.has_group_role(target_group, array['owner']::public.group_role[]) or new_role = 'owner'
    then raise exception 'forbidden'; end if;
  select role into current_role from public.group_memberships
    where group_id = target_group and user_id = target_user and status = 'active' for update;
  if current_role is null or current_role = 'owner' then raise exception 'forbidden_target'; end if;
  update public.group_memberships set role = new_role where group_id = target_group and user_id = target_user;
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (target_group, auth.uid(), 'role.changed', 'membership', target_user);
end;
$$;

create or replace function public.transfer_group_ownership(target_group uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_group_role(target_group, array['owner']::public.group_role[]) or target_user = auth.uid()
    then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.group_memberships where group_id = target_group and user_id = target_user and status = 'active')
    then raise exception 'target_not_active'; end if;
  update public.group_memberships set role = 'admin' where group_id = target_group and user_id = auth.uid() and role = 'owner';
  update public.group_memberships set role = 'owner' where group_id = target_group and user_id = target_user and status = 'active';
  insert into public.audit_events (group_id, actor_id, event_type, target_type, target_id)
    values (target_group, auth.uid(), 'role.changed', 'membership', target_user);
end;
$$;

create or replace function public.request_account_deletion()
returns uuid language plpgsql security definer set search_path = '' as $$
declare job_id uuid;
begin
  if not private.current_account_active() then raise exception 'account_not_active'; end if;
  if exists (select 1 from public.group_memberships where user_id = auth.uid() and role = 'owner' and status = 'active') then raise exception 'transfer_owned_groups_first'; end if;
  update public.profiles set status = 'deleting', deletion_requested_at = now(), updated_at = now() where id = auth.uid();
  update public.group_memberships set status = 'left', ended_at = now() where user_id = auth.uid() and status = 'active';
  insert into public.account_deletion_jobs (user_id) values (auth.uid())
    on conflict (user_id) do update set next_run_at = least(public.account_deletion_jobs.next_run_at, now())
    returning id into job_id;
  insert into public.audit_events (actor_id, event_type, target_type, target_id)
    values (auth.uid(), 'account.deletion_requested', 'account', auth.uid());
  return job_id;
end;
$$;

revoke all on function public.create_group(text) from public, anon;
revoke all on function public.create_group_invitation(uuid, text, text) from public, anon;
revoke all on function public.redeem_group_invitation(text) from public, anon;
revoke all on function public.record_invitation_delivery(uuid, public.delivery_status, text) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.change_group_member_role(uuid, uuid, public.group_role) from public, anon;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public, anon;
revoke all on function public.request_account_deletion() from public, anon;
grant execute on function public.create_group(text), public.create_group_invitation(uuid, text, text),
  public.redeem_group_invitation(text), public.leave_group(uuid), public.delete_group(uuid),
  public.record_invitation_delivery(uuid, public.delivery_status, text),
  public.remove_group_member(uuid, uuid), public.change_group_member_role(uuid, uuid, public.group_role),
  public.transfer_group_ownership(uuid, uuid), public.request_account_deletion() to authenticated;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_invitations enable row level security;
alter table public.account_deletion_jobs enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (
  private.current_account_active() and (
    id = auth.uid() or exists (
      select 1 from public.group_memberships mine join public.group_memberships theirs on theirs.group_id = mine.group_id
      where mine.user_id = auth.uid() and mine.status = 'active' and theirs.user_id = profiles.id and theirs.status = 'active'
    )
  )
);
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and private.current_account_active())
  with check (id = auth.uid() and private.current_account_active());
create policy groups_select on public.groups for select to authenticated
  using (deleted_at is null and private.has_group_role(id, array['owner','admin','member']::public.group_role[]));
create policy memberships_select on public.group_memberships for select to authenticated
  using (private.has_group_role(group_id, array['owner','admin','member']::public.group_role[]));
create policy audit_select_admin on public.audit_events for select to authenticated
  using (group_id is not null and private.has_group_role(group_id, array['owner','admin']::public.group_role[]));

revoke all on table public.profiles, public.groups, public.group_memberships, public.group_invitations,
  public.account_deletion_jobs, public.audit_events from anon, authenticated;
grant select on public.profiles, public.groups, public.group_memberships to authenticated;
grant update (display_name) on public.profiles to authenticated;
