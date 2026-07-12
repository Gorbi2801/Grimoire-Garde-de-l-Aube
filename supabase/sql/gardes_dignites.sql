alter table public.mk_gardes
  add column if not exists dignite text;

alter table public.mk_gardes
  drop constraint if exists mk_gardes_dignite_check;

alter table public.mk_gardes
  add constraint mk_gardes_dignite_check
  check (
    dignite is null
    or dignite in (
      'Maître d''armes',
      'Intendant de Fort Aube',
      'Gardien du Grimoire',
      'Maître des Renseignements',
      'Gardien de Fort Aube',
      'Maître des Recrues',
      'Prévôt de l''Ordre'
    )
  );

create index if not exists mk_gardes_dignite_idx
  on public.mk_gardes(dignite)
  where dignite is not null;

grant select on public.mk_gardes to authenticated;
grant update(dignite) on public.mk_gardes to authenticated;

drop policy if exists "read gardes for cour dignites" on public.mk_gardes;
create policy "read gardes for cour dignites"
on public.mk_gardes
for select
to authenticated
using (
  public.is_superadmin()
  or exists (
    select 1
    from public.mk_profiles p
    where p.user_id = auth.uid()
      and (
        'garde' = any(coalesce(p.sections, '{}'::text[]))
        or 'cour' = any(coalesce(p.sections, '{}'::text[]))
      )
  )
);

drop policy if exists "edit cour dignites" on public.mk_gardes;
create policy "edit cour dignites"
on public.mk_gardes
for update
to authenticated
using (
  public.is_superadmin()
  or exists (
    select 1
    from public.mk_profiles p
    where p.user_id = auth.uid()
      and 'cour' = any(coalesce(p.sections_edit, '{}'::text[]))
  )
)
with check (
  public.is_superadmin()
  or exists (
    select 1
    from public.mk_profiles p
    where p.user_id = auth.uid()
      and 'cour' = any(coalesce(p.sections_edit, '{}'::text[]))
  )
);
