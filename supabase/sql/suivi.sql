create or replace function public.garde_grade_level(grade text)
returns integer
language sql
immutable
as $$
  select case trim(coalesce(grade, ''))
    when 'Commandeur de l''Aube' then 4
    when 'Sénéchal de l''Aube' then 4
    when 'Exécuteur de la Garde' then 3
    when 'Traqueur de la Garde' then 2
    when 'Patrouilleur de la Garde' then 1
    when 'Aspirant de la Garde' then 1
    when 'Artisan de la Garde' then 1
    when 'Confrère de la Garde' then 1
    when 'Mage de la Garde' then 1
    when 'Barde de la Garde' then 1
    else 0
  end;
$$;

revoke all on function public.garde_grade_level(text) from public;
grant execute on function public.garde_grade_level(text) to authenticated;

create or replace function public.can_manage_garde(target_garde_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  with current_garde as (
    select g.grade
    from public.mk_gardes g
    where g.user_id = auth.uid()
    limit 1
  ),
  target_garde as (
    select g.grade
    from public.mk_gardes g
    where g.id = target_garde_id
      and g.user_id is not null
    limit 1
  )
  select public.is_superadmin()
    or exists (
      select 1
      from current_garde cg
      cross join target_garde tg
      where public.garde_grade_level(cg.grade) > public.garde_grade_level(tg.grade)
        and public.garde_grade_level(tg.grade) > 0
    );
$$;

revoke all on function public.can_manage_garde(uuid) from public;
grant execute on function public.can_manage_garde(uuid) to authenticated;

create table if not exists public.mk_garde_suivi (
  id uuid primary key default gen_random_uuid(),
  garde_id uuid not null references public.mk_gardes(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('warn', 'positive', 'note')),
  loi_id text,
  title text not null default '' check (length(trim(title)) <= 160),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists mk_garde_suivi_garde_created_idx on public.mk_garde_suivi(garde_id, created_at desc);
create index if not exists mk_garde_suivi_author_created_idx on public.mk_garde_suivi(author_user_id, created_at desc);

alter table public.mk_garde_suivi enable row level security;

drop policy if exists "read managed garde suivi" on public.mk_garde_suivi;
create policy "read managed garde suivi"
on public.mk_garde_suivi
for select
to authenticated
using (
  public.can_manage_garde(garde_id)
);

drop policy if exists "create managed garde suivi" on public.mk_garde_suivi;
create policy "create managed garde suivi"
on public.mk_garde_suivi
for insert
to authenticated
with check (
  author_user_id = auth.uid()
  and public.can_manage_garde(garde_id)
);

revoke all on public.mk_garde_suivi from anon;
revoke all on public.mk_garde_suivi from authenticated;
grant select, insert on public.mk_garde_suivi to authenticated;

drop policy if exists "read managed garde presences" on public.mk_presences;
create policy "read managed garde presences"
on public.mk_presences
for select
to authenticated
using (
  exists (
    select 1
    from public.mk_gardes managed_garde
    where managed_garde.user_id = mk_presences.user_id
      and public.can_manage_garde(managed_garde.id)
  )
);
