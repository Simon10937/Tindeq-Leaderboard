begin;
select plan(9);

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
select isnt_empty(
  $$select 1
    from information_schema.check_constraints
    where constraint_name = 'tracker_sessions_mode_check'
      and check_clause like '%peak_force%'$$,
  'tracker mode check includes peak force'
);

select * from finish();
rollback;
