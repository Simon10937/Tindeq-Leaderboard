begin;
select plan(7);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'assessment_attempts', 'attempt table exists');
select has_view('public', 'leaderboard_entries', 'safe leaderboard view exists');
select has_function('public', 'create_group', 'group creation RPC exists');
select has_function('public', 'publish_assessment_session', 'publication RPC exists');
select has_function('public', 'list_leaderboard_entries', 'authorized leaderboard read RPC exists');
select is(
  (select public from storage.buckets where id = 'assessment-evidence'),
  false,
  'assessment evidence bucket is private'
);

select * from finish();
rollback;
