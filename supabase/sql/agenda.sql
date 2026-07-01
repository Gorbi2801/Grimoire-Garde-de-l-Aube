create table if not exists public.mk_agenda_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 140),
  description text check (description is null or length(trim(description)) <= 5000),
  location text check (location is null or length(trim(location)) <= 180),
  type text not null default 'Événement' check (type in ('Événement', 'Cours', 'Intervention', 'Patrouille', 'Réunion', 'Entraînement')),
  status text not null default 'Prévu' check (status in ('Prévu', 'Confirmé', 'Annulé', 'Terminé')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  organizer_name text,
  organizer_grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mk_agenda_events_valid_range check (ends_at >= starts_at)
);

create index if not exists mk_agenda_events_starts_idx on public.mk_agenda_events(starts_at);
create index if not exists mk_agenda_events_range_idx on public.mk_agenda_events(starts_at, ends_at);
create index if not exists mk_agenda_events_organizer_idx on public.mk_agenda_events(organizer_user_id, starts_at desc);
create index if not exists mk_agenda_events_type_idx on public.mk_agenda_events(type);
create index if not exists mk_agenda_events_status_idx on public.mk_agenda_events(status);

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

alter table public.mk_agenda_events enable row level security;

drop policy if exists "read agenda events" on public.mk_agenda_events;
create policy "read agenda events"
on public.mk_agenda_events
for select
to authenticated
using (public.can_access_section('agenda'));

drop policy if exists "create agenda events" on public.mk_agenda_events;
create policy "create agenda events"
on public.mk_agenda_events
for insert
to authenticated
with check (
  organizer_user_id = auth.uid()
  and public.can_edit_section('agenda')
);

drop policy if exists "update agenda events" on public.mk_agenda_events;
create policy "update agenda events"
on public.mk_agenda_events
for update
to authenticated
using (public.can_edit_section('agenda'))
with check (public.can_edit_section('agenda'));

drop policy if exists "delete agenda events" on public.mk_agenda_events;
create policy "delete agenda events"
on public.mk_agenda_events
for delete
to authenticated
using (public.can_edit_section('agenda'));

revoke all on public.mk_agenda_events from anon;
revoke all on public.mk_agenda_events from authenticated;
grant select, insert, update, delete on public.mk_agenda_events to authenticated;
