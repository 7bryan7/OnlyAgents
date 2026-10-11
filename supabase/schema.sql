-- Run in the Supabase SQL editor. This contains no application secrets.
-- JSONB stores application rows, not a SQLite file; every invocation constructs
-- an isolated, disposable SQL working copy to retain validated wallet queries.
create table if not exists public.onlyagent_state (
  id boolean primary key default true check (id),
  snapshot jsonb not null default '{"tables":{}}',
  version bigint not null default 0,
  lease_owner uuid,
  lease_until timestamptz
);
insert into public.onlyagent_state(id) values(true) on conflict do nothing;
alter table public.onlyagent_state enable row level security;
revoke all on public.onlyagent_state from anon, authenticated;

create or replace function public.oa_read() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('snapshot', snapshot, 'version', version)
  from public.onlyagent_state where id = true;
$$;

create or replace function public.oa_acquire(p_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.onlyagent_state;
begin
  select * into s from public.onlyagent_state where id = true for update;
  if s.lease_until > clock_timestamp() then raise exception 'OA_BUSY'; end if;
  update public.onlyagent_state set lease_owner = p_owner,
    lease_until = clock_timestamp() + interval '330 seconds' where id = true;
  return jsonb_build_object('snapshot', s.snapshot, 'version', s.version);
end; $$;

create or replace function public.oa_commit(p_owner uuid, p_version bigint, p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if jsonb_typeof(p_snapshot->'tables') is distinct from 'object' then raise exception 'Invalid snapshot'; end if;
  update public.onlyagent_state set snapshot = p_snapshot, version = version + 1
  where id = true and lease_owner = p_owner and lease_until > clock_timestamp() and version = p_version
  returning version into v;
  if v is null then raise exception 'OA_FENCE'; end if;
  return jsonb_build_object('version', v);
end; $$;

create or replace function public.oa_release(p_owner uuid) returns void
language sql security definer set search_path = '' as $$
  update public.onlyagent_state set lease_owner = null, lease_until = null
  where id = true and lease_owner = p_owner;
$$;

-- Functions are server-only. Browser wallets never receive service-role access.
revoke all on function public.oa_read() from public, anon, authenticated;
revoke all on function public.oa_acquire(uuid) from public, anon, authenticated;
revoke all on function public.oa_commit(uuid,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.oa_release(uuid) from public, anon, authenticated;
grant execute on function public.oa_read(), public.oa_acquire(uuid), public.oa_commit(uuid,bigint,jsonb), public.oa_release(uuid) to service_role;
