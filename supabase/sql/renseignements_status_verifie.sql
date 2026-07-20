do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mk_rens_fiches'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%statut%'
  loop
    execute format('alter table public.mk_rens_fiches drop constraint %I', v_constraint);
  end loop;
end $$;

alter table public.mk_rens_fiches
  add constraint mk_rens_fiches_statut_check
  check (statut in ('neutre', 'surveillance', 'recherche', 'verifie', 'neutralise'));

do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mk_rens_rapports'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%fiabilite%'
  loop
    execute format('alter table public.mk_rens_rapports drop constraint %I', v_constraint);
  end loop;
end $$;

alter table public.mk_rens_rapports
  add constraint mk_rens_rapports_fiabilite_check
  check (fiabilite in ('confirme', 'verifie', 'nonverif', 'urgente', 'fausse'));
