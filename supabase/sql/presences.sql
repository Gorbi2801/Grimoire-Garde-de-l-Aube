create table if not exists public.mk_presences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mk_presences_valid_range check (ended_at is null or ended_at >= started_at)
);

create index if not exists mk_presences_user_started_idx on public.mk_presences(user_id, started_at desc);
create unique index if not exists mk_presences_one_open_per_user_idx
  on public.mk_presences(user_id)
  where ended_at is null;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mk_profiles
    where user_id = auth.uid()
      and is_superadmin = true
  );
$$;

revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

alter table public.mk_presences enable row level security;

drop policy if exists "read own presences or admin" on public.mk_presences;
create policy "read own presences or admin"
on public.mk_presences
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_superadmin()
);

drop policy if exists "start own presence" on public.mk_presences;
create policy "start own presence"
on public.mk_presences
for insert
to authenticated
with check (
  user_id = auth.uid()
  and ended_at is null
  and started_at >= now() - interval '5 minutes'
  and started_at <= now() + interval '5 minutes'
);

drop policy if exists "stop own active presence" on public.mk_presences;
create policy "stop own active presence"
on public.mk_presences
for update
to authenticated
using (
  user_id = auth.uid()
  and ended_at is null
)
with check (
  user_id = auth.uid()
  and ended_at is not null
  and ended_at <= now() + interval '5 minutes'
);

revoke all on public.mk_presences from anon;
revoke all on public.mk_presences from authenticated;
grant select on public.mk_presences to authenticated;
grant insert(user_id) on public.mk_presences to authenticated;
grant update(ended_at) on public.mk_presences to authenticated;

drop view if exists public.mk_presence_summary;

create view public.mk_presence_summary
with (security_invoker = false)
as
select
  p.user_id,
  p.username,
  p.display_name,
  g.prenom,
  g.nom,
  g.grade,
  exists (
    select 1
    from public.mk_presences active_presence
    where active_presence.user_id = p.user_id
      and active_presence.ended_at is null
  ) as is_active,
  (
    select max(active_presence.started_at)
    from public.mk_presences active_presence
    where active_presence.user_id = p.user_id
      and active_presence.ended_at is null
  ) as active_since,
  (
    select max(coalesce(done_presence.ended_at, done_presence.started_at))
    from public.mk_presences done_presence
    where done_presence.user_id = p.user_id
  ) as last_seen_at,
  coalesce((
    select sum(extract(epoch from (coalesce(pr.ended_at, now()) - pr.started_at)))::bigint
    from public.mk_presences pr
    where pr.user_id = p.user_id
  ), 0) as total_seconds,
  coalesce((
    select sum(extract(epoch from (coalesce(pr.ended_at, now()) - greatest(pr.started_at, date_trunc('day', now())))))::bigint
    from public.mk_presences pr
    where pr.user_id = p.user_id
      and coalesce(pr.ended_at, now()) >= date_trunc('day', now())
  ), 0) as today_seconds,
  coalesce((
    select sum(extract(epoch from (coalesce(pr.ended_at, now()) - greatest(pr.started_at, now() - interval '7 days'))))::bigint
    from public.mk_presences pr
    where pr.user_id = p.user_id
      and coalesce(pr.ended_at, now()) >= now() - interval '7 days'
  ), 0) as week_seconds
from public.mk_profiles p
left join public.mk_gardes g on g.user_id = p.user_id
where p.user_id is not null;

revoke all on public.mk_presence_summary from public;
grant select on public.mk_presence_summary to authenticated;
