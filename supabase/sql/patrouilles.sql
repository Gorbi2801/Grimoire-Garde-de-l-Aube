create table if not exists public.mk_patrouilles (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Patrouille' check (length(trim(title)) between 1 and 120),
  location text not null check (length(trim(location)) between 1 and 160),
  objective text not null check (length(trim(objective)) between 1 and 3000),
  planned_duration_minutes integer check (planned_duration_minutes is null or planned_duration_minutes >= 0),
  status text not null default 'active' check (status in ('active', 'closed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text check (notes is null or length(trim(notes)) <= 3000),
  created_at timestamptz not null default now(),
  constraint mk_patrouilles_valid_range check (ended_at is null or ended_at >= started_at),
  constraint mk_patrouilles_closed_has_end check (
    (status = 'active' and ended_at is null)
    or (status = 'closed' and ended_at is not null)
  )
);

create table if not exists public.mk_patrouille_members (
  patrouille_id uuid not null references public.mk_patrouilles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (patrouille_id, user_id)
);

create index if not exists mk_patrouilles_status_started_idx on public.mk_patrouilles(status, started_at desc);
create index if not exists mk_patrouilles_created_by_idx on public.mk_patrouilles(created_by, created_at desc);
create index if not exists mk_patrouille_members_user_idx on public.mk_patrouille_members(user_id);

create or replace function public.can_access_section(section_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.mk_profiles p
      where p.user_id = auth.uid()
        and to_jsonb(p.sections) ? section_key
    );
$$;

revoke all on function public.can_access_section(text) from public;
grant execute on function public.can_access_section(text) to authenticated;

create or replace function public.can_edit_section(section_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_superadmin()
    or exists (
      select 1
      from public.mk_profiles p
      where p.user_id = auth.uid()
        and to_jsonb(p.sections_edit) ? section_key
    );
$$;

revoke all on function public.can_edit_section(text) from public;
grant execute on function public.can_edit_section(text) to authenticated;

alter table public.mk_patrouilles enable row level security;
alter table public.mk_patrouille_members enable row level security;

drop policy if exists "read patrouilles" on public.mk_patrouilles;
create policy "read patrouilles"
on public.mk_patrouilles
for select
to authenticated
using (public.can_access_section('patrouilles'));

drop policy if exists "create own patrouille" on public.mk_patrouilles;
create policy "create own patrouille"
on public.mk_patrouilles
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_section('patrouilles')
  and status = 'active'
  and ended_at is null
  and started_at >= now() - interval '5 minutes'
  and started_at <= now() + interval '5 minutes'
);

drop policy if exists "close own patrouille or admin" on public.mk_patrouilles;
create policy "close own patrouille or admin"
on public.mk_patrouilles
for update
to authenticated
using (
  status = 'active'
  and ended_at is null
  and (created_by = auth.uid() or public.can_edit_section('patrouilles'))
)
with check (
  status = 'closed'
  and ended_at is not null
  and ended_at <= now() + interval '5 minutes'
  and (created_by = auth.uid() or public.can_edit_section('patrouilles'))
);

drop policy if exists "read patrouille members" on public.mk_patrouille_members;
create policy "read patrouille members"
on public.mk_patrouille_members
for select
to authenticated
using (public.can_access_section('patrouilles'));

drop policy if exists "create members for own patrouille" on public.mk_patrouille_members;
create policy "create members for own patrouille"
on public.mk_patrouille_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.mk_patrouilles p
    where p.id = patrouille_id
      and p.status = 'active'
      and (p.created_by = auth.uid() or public.can_edit_section('patrouilles'))
  )
);

revoke all on public.mk_patrouilles from anon;
revoke all on public.mk_patrouilles from authenticated;
grant select on public.mk_patrouilles to authenticated;
grant insert(created_by, title, location, objective, planned_duration_minutes) on public.mk_patrouilles to authenticated;
grant update(status, ended_at, notes) on public.mk_patrouilles to authenticated;

revoke all on public.mk_patrouille_members from anon;
revoke all on public.mk_patrouille_members from authenticated;
grant select on public.mk_patrouille_members to authenticated;
grant insert(patrouille_id, user_id) on public.mk_patrouille_members to authenticated;
