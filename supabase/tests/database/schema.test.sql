begin;
select plan(22);

select has_table('public', 'tracker_sessions', 'tracker sessions table exists');
select has_column('public', 'tracker_sessions', 'session', 'full normalized session JSON is stored');
select has_column('public', 'tracker_sessions', 'mode', 'mode query column exists');
select has_column('public', 'tracker_sessions', 'grip', 'grip query column exists');
select has_column('public', 'tracker_sessions', 'tested_at', 'tested-at query column exists');
select col_is_pk('public', 'tracker_sessions', 'id', 'session id is the primary key');
select indexes_are(
  'public',
  'tracker_sessions',
  array['tracker_sessions_pkey', 'tracker_sessions_user_tested_at_idx'],
  'tracker sessions expose only the primary key and owner/date lookup index'
);
select policies_are(
  'public',
  'tracker_sessions',
  array[
    'Users can view their tracker sessions',
    'Users can insert their tracker sessions',
    'Users can update their tracker sessions',
    'Users can delete their tracker sessions'
  ],
  'owner-scoped tracker session policies exist'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.tracker_sessions'::regclass),
  true,
  'row level security is enabled for tracker sessions'
);
select is_empty(
  $$select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'tracker_sessions'
      and grantee = 'anon'$$,
  'anonymous users have no direct tracker sessions grant'
);
select isnt_empty(
  $$select 1
    from information_schema.check_constraints
    where constraint_name = 'tracker_sessions_mode_check'
      and check_clause like '%peak_force%'$$,
  'tracker mode check includes peak force'
);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  ('00000000-0000-4000-8000-000000000001', 'owner-a@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000000002', 'owner-b@example.com', '', now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated');

insert into public.tracker_sessions (id, user_id, session, mode, grip, tested_at)
values
  ('session-a', '00000000-0000-4000-8000-000000000001', '{"id":"session-a"}', 'repeater', '20mm edge', '2026-08-20T10:00:00Z'),
  ('session-b', '00000000-0000-4000-8000-000000000002', '{"id":"session-b"}', 'peak_force', 'half crimp', '2026-08-21T10:00:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select id from public.tracker_sessions order by id$$,
  array['session-a'],
  'authenticated users can only view their own tracker sessions'
);
select is_empty(
  $$select 1 from public.tracker_sessions where id = 'session-b'$$,
  'authenticated users cannot read another owner tracker session'
);
select lives_ok(
  $$insert into public.tracker_sessions (id, user_id, session, mode, grip, tested_at)
    values ('session-a-insert', '00000000-0000-4000-8000-000000000001', '{"id":"session-a-insert"}', 'endurance', '20mm edge', '2026-08-22T10:00:00Z')$$,
  'authenticated users can insert their own tracker sessions'
);
select throws_ok(
  $$insert into public.tracker_sessions (id, user_id, session, mode, grip, tested_at)
    values ('session-b-spoof', '00000000-0000-4000-8000-000000000002', '{"id":"session-b-spoof"}', 'repeater', '20mm edge', '2026-08-22T10:00:00Z')$$,
  '42501',
  'new row violates row-level security policy for table "tracker_sessions"',
  'authenticated users cannot insert tracker sessions for another owner'
);
select lives_ok(
  $$update public.tracker_sessions set grip = '15mm edge' where id = 'session-a'$$,
  'authenticated users can update their own tracker sessions'
);
select throws_ok(
  $$update public.tracker_sessions set user_id = '00000000-0000-4000-8000-000000000002' where id = 'session-a'$$,
  '42501',
  'new row violates row-level security policy for table "tracker_sessions"',
  'authenticated users cannot transfer a tracker session to another owner'
);
select results_eq(
  $$update public.tracker_sessions set grip = 'jug' where id = 'session-b' returning id$$,
  array[]::text[],
  'authenticated users cannot update another owner tracker session'
);
select results_eq(
  $$delete from public.tracker_sessions where id = 'session-b' returning id$$,
  array[]::text[],
  'authenticated users cannot delete another owner tracker session'
);
select lives_ok(
  $$delete from public.tracker_sessions where id = 'session-a'$$,
  'authenticated users can delete their own tracker sessions'
);
select is_empty(
  $$select 1 from public.tracker_sessions where id = 'session-a'$$,
  'deleted owner tracker sessions are gone'
);
reset role;
select results_eq(
  $$select grip from public.tracker_sessions where id = 'session-b'$$,
  array['half crimp'],
  'another owner tracker session survives unauthorized update and delete attempts'
);

select * from finish();
rollback;
