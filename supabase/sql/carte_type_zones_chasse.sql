-- Ajoute le type "Zones de chasse" aux pings et zones de la carte.
-- A lancer dans le SQL editor Supabase.

alter table public.mk_map_pins
  drop constraint if exists mk_map_pins_type_check;

alter table public.mk_map_pins
  add constraint mk_map_pins_type_check
  check (type in ('Risque', 'Intérêt', 'Rumeur', 'Patrouille', 'Enquête', 'Lieu sûr', 'Zones de chasse'));

alter table public.mk_map_zones
  drop constraint if exists mk_map_zones_type_check;

alter table public.mk_map_zones
  add constraint mk_map_zones_type_check
  check (type in ('Risque', 'Intérêt', 'Rumeur', 'Patrouille', 'Enquête', 'Lieu sûr', 'Zones de chasse'));
