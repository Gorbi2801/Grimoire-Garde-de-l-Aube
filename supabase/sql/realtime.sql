-- Active Supabase Realtime sur les tables utilisées par scripts/realtime.js.
-- Le bloc ignore les tables absentes et celles déjà présentes dans la publication.

do $$
declare
  table_name text;
  realtime_tables text[] := array[
    'mk_citoyens',
    'mk_transactions',
    'mk_cour',
    'mk_diplomatie',
    'mk_lois',
    'mk_inventaire',
    'mk_ordres_fabrication',
    'mk_recettes',
    'mk_profiles',
    'mk_gardes',
    'mk_presences',
    'mk_agenda_events',
    'mk_patrouilles',
    'mk_patrouille_members',
    'mk_garde_suivi',
    'mk_missives',
    'mk_rens_fiches',
    'mk_rens_rapports',
    'mk_rens_relations',
    'mk_rens_rapport_liens',
    'mk_rens_rapport_rapport',
    'mk_rens_map_nodes',
    'mk_rens_map_links',
    'mk_map_pins',
    'mk_map_zones',
    'mk_map_pin_reports',
    'mk_map_zone_reports'
  ];
begin
  foreach table_name in array realtime_tables loop
    if to_regclass(format('public.%I', table_name)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
