begin;
select plan(6);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'assessment_attempts', 'attempt table exists');
select has_view('public', 'leaderboard_entries', 'safe leaderboard view exists');
select has_function('public', 'create_group', 'group creation RPC exists');
select has_function('public', 'publish_assessment_session', 'publication RPC exists');
select is(
  (select public from storage.buckets where id = 'assessment-evidence'),
  false,
  'assessment evidence bucket is private'
);

select * from finish();
rollback;
