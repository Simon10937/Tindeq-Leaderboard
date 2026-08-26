alter table public.tracker_sessions
  drop constraint if exists tracker_sessions_mode_check;

alter table public.tracker_sessions
  add constraint tracker_sessions_mode_check
  check (mode in ('endurance', 'repeater', 'peak_force', 'unsupported_trace'));
