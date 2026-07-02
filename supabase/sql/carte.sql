create table if not exists public.mk_map_pins (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 140),
  type text not null default 'Risque' check (type in ('Risque', 'Intérêt', 'Rumeur', 'Patrouille', 'Enquête', 'Lieu sûr', 'Zones de chasse')),
  risk_level text not null default 'Modéré' check (risk_level in ('Faible', 'Modéré', 'Élevé', 'Critique')),
  status text not null default 'À vérifier' check (status in ('À vérifier', 'Confirmé', 'En cours', 'Résolu', 'Obsolète')),
  color text not null default '#8B5E00' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description text check (description is null or length(trim(description)) <= 5000),
  x numeric(8,7) not null check (x >= 0 and x <= 1),
  y numeric(8,7) not null check (y >= 0 and y <= 1),
  patrouille_id uuid references public.mk_patrouilles(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text,
  created_by_grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mk_map_pin_reports (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.mk_map_pins(id) on delete cascade,
  report_id uuid not null references public.mk_rens_rapports(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pin_id, report_id)
);

create table if not exists public.mk_map_zones (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 140),
  type text not null default 'Risque' check (type in ('Risque', 'Intérêt', 'Rumeur', 'Patrouille', 'Enquête', 'Lieu sûr', 'Zones de chasse')),
  risk_level text not null default 'Modéré' check (risk_level in ('Faible', 'Modéré', 'Élevé', 'Critique')),
  status text not null default 'À vérifier' check (status in ('À vérifier', 'Confirmé', 'En cours', 'Résolu', 'Obsolète')),
  color text not null default '#8B5E00' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description text check (description is null or length(trim(description)) <= 5000),
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) >= 3),
  patrouille_id uuid references public.mk_patrouilles(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_by_name text,
  created_by_grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mk_map_zone_reports (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.mk_map_zones(id) on delete cascade,
  report_id uuid not null references public.mk_rens_rapports(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (zone_id, report_id)
);

alter table public.mk_map_pins add column if not exists status text not null default 'À vérifier';
alter table public.mk_map_pins add column if not exists color text not null default '#8B5E00';
alter table public.mk_map_pins add column if not exists patrouille_id uuid references public.mk_patrouilles(id) on delete set null;
alter table public.mk_map_pins add column if not exists created_by_grade text;
alter table public.mk_map_zones add column if not exists created_by_grade text;

update public.mk_map_pins p
set
  created_by_name = coalesce(p.created_by_name, nullif(trim(concat_ws(' ', g.prenom, g.nom)), '')),
  created_by_grade = coalesce(p.created_by_grade, g.grade)
from public.mk_gardes g
where p.created_by = g.user_id
  and (p.created_by_name is null or p.created_by_grade is null);

update public.mk_map_zones z
set
  created_by_name = coalesce(z.created_by_name, nullif(trim(concat_ws(' ', g.prenom, g.nom)), '')),
  created_by_grade = coalesce(z.created_by_grade, g.grade)
from public.mk_gardes g
where z.created_by = g.user_id
  and (z.created_by_name is null or z.created_by_grade is null);

create index if not exists mk_map_pins_type_idx on public.mk_map_pins(type);
create index if not exists mk_map_pins_risk_idx on public.mk_map_pins(risk_level);
create index if not exists mk_map_pins_status_idx on public.mk_map_pins(status);
create index if not exists mk_map_pins_patrouille_idx on public.mk_map_pins(patrouille_id);
create index if not exists mk_map_pins_created_idx on public.mk_map_pins(created_at desc);
create index if not exists mk_map_pin_reports_pin_idx on public.mk_map_pin_reports(pin_id);
create index if not exists mk_map_pin_reports_report_idx on public.mk_map_pin_reports(report_id);
create index if not exists mk_map_zones_type_idx on public.mk_map_zones(type);
create index if not exists mk_map_zones_risk_idx on public.mk_map_zones(risk_level);
create index if not exists mk_map_zones_status_idx on public.mk_map_zones(status);
create index if not exists mk_map_zones_patrouille_idx on public.mk_map_zones(patrouille_id);
create index if not exists mk_map_zones_created_idx on public.mk_map_zones(created_at desc);
create index if not exists mk_map_zone_reports_zone_idx on public.mk_map_zone_reports(zone_id);
create index if not exists mk_map_zone_reports_report_idx on public.mk_map_zone_reports(report_id);

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

alter table public.mk_map_pins enable row level security;
alter table public.mk_map_pin_reports enable row level security;
alter table public.mk_map_zones enable row level security;
alter table public.mk_map_zone_reports enable row level security;

drop policy if exists "read map pins" on public.mk_map_pins;
create policy "read map pins"
on public.mk_map_pins
for select
to authenticated
using (public.can_access_section('carte'));

drop policy if exists "create map pins" on public.mk_map_pins;
create policy "create map pins"
on public.mk_map_pins
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_edit_section('carte')
);

drop policy if exists "update map pins" on public.mk_map_pins;
create policy "update map pins"
on public.mk_map_pins
for update
to authenticated
using (public.can_edit_section('carte'))
with check (public.can_edit_section('carte'));

drop policy if exists "delete map pins" on public.mk_map_pins;
create policy "delete map pins"
on public.mk_map_pins
for delete
to authenticated
using (public.can_edit_section('carte'));

drop policy if exists "read map pin reports" on public.mk_map_pin_reports;
create policy "read map pin reports"
on public.mk_map_pin_reports
for select
to authenticated
using (public.can_access_section('carte'));

drop policy if exists "create map pin reports" on public.mk_map_pin_reports;
create policy "create map pin reports"
on public.mk_map_pin_reports
for insert
to authenticated
with check (public.can_edit_section('carte'));

drop policy if exists "delete map pin reports" on public.mk_map_pin_reports;
create policy "delete map pin reports"
on public.mk_map_pin_reports
for delete
to authenticated
using (public.can_edit_section('carte'));

drop policy if exists "read map zones" on public.mk_map_zones;
create policy "read map zones"
on public.mk_map_zones
for select
to authenticated
using (public.can_access_section('carte'));

drop policy if exists "create map zones" on public.mk_map_zones;
create policy "create map zones"
on public.mk_map_zones
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_edit_section('carte')
);

drop policy if exists "update map zones" on public.mk_map_zones;
create policy "update map zones"
on public.mk_map_zones
for update
to authenticated
using (public.can_edit_section('carte'))
with check (public.can_edit_section('carte'));

drop policy if exists "delete map zones" on public.mk_map_zones;
create policy "delete map zones"
on public.mk_map_zones
for delete
to authenticated
using (public.can_edit_section('carte'));

drop policy if exists "read map zone reports" on public.mk_map_zone_reports;
create policy "read map zone reports"
on public.mk_map_zone_reports
for select
to authenticated
using (public.can_access_section('carte'));

drop policy if exists "create map zone reports" on public.mk_map_zone_reports;
create policy "create map zone reports"
on public.mk_map_zone_reports
for insert
to authenticated
with check (public.can_edit_section('carte'));

drop policy if exists "delete map zone reports" on public.mk_map_zone_reports;
create policy "delete map zone reports"
on public.mk_map_zone_reports
for delete
to authenticated
using (public.can_edit_section('carte'));

revoke all on public.mk_map_pins from anon;
revoke all on public.mk_map_pins from authenticated;
grant select on public.mk_map_pins to authenticated;
grant insert(title, type, risk_level, status, color, description, x, y, patrouille_id, created_by, created_by_name, created_by_grade, updated_at) on public.mk_map_pins to authenticated;
grant update(title, type, risk_level, status, color, description, x, y, patrouille_id, updated_at) on public.mk_map_pins to authenticated;
grant delete on public.mk_map_pins to authenticated;

revoke all on public.mk_map_pin_reports from anon;
revoke all on public.mk_map_pin_reports from authenticated;
grant select on public.mk_map_pin_reports to authenticated;
grant insert(pin_id, report_id) on public.mk_map_pin_reports to authenticated;
grant delete on public.mk_map_pin_reports to authenticated;

revoke all on public.mk_map_zones from anon;
revoke all on public.mk_map_zones from authenticated;
grant select on public.mk_map_zones to authenticated;
grant insert(title, type, risk_level, status, color, description, points, patrouille_id, created_by, created_by_name, created_by_grade, updated_at) on public.mk_map_zones to authenticated;
grant update(title, type, risk_level, status, color, description, points, patrouille_id, updated_at) on public.mk_map_zones to authenticated;
grant delete on public.mk_map_zones to authenticated;

revoke all on public.mk_map_zone_reports from anon;
revoke all on public.mk_map_zone_reports from authenticated;
grant select on public.mk_map_zone_reports to authenticated;
grant insert(zone_id, report_id) on public.mk_map_zone_reports to authenticated;
grant delete on public.mk_map_zone_reports to authenticated;
