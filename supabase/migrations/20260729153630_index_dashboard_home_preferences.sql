create index profiles_preferred_group_idx
  on public.profiles (preferred_group_id)
  where preferred_group_id is not null;

create index profiles_preferred_protocol_idx
  on public.profiles (preferred_protocol_version_id)
  where preferred_protocol_version_id is not null;
