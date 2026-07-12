-- Absences déclarées par les gardes.
-- À exécuter dans Supabase SQL Editor, puis relancer supabase/sql/realtime.sql si besoin.

create table if not exists public.mk_absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason_hrp text,
  reason_rp text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_notified_at timestamptz,
  constraint mk_absences_valid_range check (ends_at > starts_at),
  constraint mk_absences_reason_hrp_len check (reason_hrp is null or char_length(reason_hrp) <= 2000),
  constraint mk_absences_reason_rp_len check (reason_rp is null or char_length(reason_rp) <= 3000)
);

alter table public.mk_absences
  add column if not exists ended_notified_at timestamptz;

create index if not exists mk_absences_user_starts_idx on public.mk_absences(user_id, starts_at desc);
create index if not exists mk_absences_range_idx on public.mk_absences(starts_at, ends_at);
create index if not exists mk_absences_user_range_idx on public.mk_absences(user_id, starts_at, ends_at);

create or replace function public.mk_touch_absences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mk_absences_touch_updated_at on public.mk_absences;
create trigger mk_absences_touch_updated_at
before update on public.mk_absences
for each row execute function public.mk_touch_absences_updated_at();

create or replace function public.mk_can_read_absences()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mk_profiles p
    where p.user_id = auth.uid()
      and (
        p.is_superadmin = true
        or 'absences' = any(coalesce(p.sections, array[]::text[]))
        or 'garde' = any(coalesce(p.sections, array[]::text[]))
        or 'presences' = any(coalesce(p.sections, array[]::text[]))
        or 'presence-logs' = any(coalesce(p.sections, array[]::text[]))
      )
  );
$$;

create or replace function public.mk_can_edit_absences()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mk_profiles p
    where p.user_id = auth.uid()
      and (
        p.is_superadmin = true
        or 'absences' = any(coalesce(p.sections_edit, array[]::text[]))
      )
  );
$$;

create or replace function public.mk_can_use_absences()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mk_profiles p
    where p.user_id = auth.uid()
      and (
        p.is_superadmin = true
        or 'absences' = any(coalesce(p.sections, array[]::text[]))
      )
  );
$$;

revoke all on function public.mk_can_read_absences() from public;
revoke all on function public.mk_can_edit_absences() from public;
revoke all on function public.mk_can_use_absences() from public;
grant execute on function public.mk_can_read_absences() to authenticated;
grant execute on function public.mk_can_edit_absences() to authenticated;
grant execute on function public.mk_can_use_absences() to authenticated;

alter table public.mk_absences enable row level security;

drop policy if exists "read absences for authorized users" on public.mk_absences;
create policy "read absences for authorized users"
on public.mk_absences
for select
to authenticated
using (public.mk_can_read_absences());

drop policy if exists "create own absence" on public.mk_absences;
create policy "create own absence"
on public.mk_absences
for insert
to authenticated
with check (
  public.mk_can_use_absences()
  and user_id = auth.uid()
  and created_by = auth.uid()
  and ends_at > starts_at
);

drop policy if exists "update own absence or editor" on public.mk_absences;
create policy "update own absence or editor"
on public.mk_absences
for update
to authenticated
using (
  public.mk_can_edit_absences()
  or (public.mk_can_use_absences() and (user_id = auth.uid() or created_by = auth.uid()))
)
with check (
  (
    public.mk_can_edit_absences()
    or (public.mk_can_use_absences() and (user_id = auth.uid() or created_by = auth.uid()))
  )
  and ends_at > starts_at
);

drop policy if exists "delete own absence or editor" on public.mk_absences;
create policy "delete own absence or editor"
on public.mk_absences
for delete
to authenticated
using (
  public.mk_can_edit_absences()
  or (public.mk_can_use_absences() and (user_id = auth.uid() or created_by = auth.uid()))
);

revoke all on public.mk_absences from anon;
revoke all on public.mk_absences from authenticated;
grant select on public.mk_absences to authenticated;
grant insert(user_id, starts_at, ends_at, reason_hrp, reason_rp, created_by) on public.mk_absences to authenticated;
grant update(starts_at, ends_at, reason_hrp, reason_rp, updated_at) on public.mk_absences to authenticated;
grant delete on public.mk_absences to authenticated;

create or replace function public.mk_absence_discord_name(
  p_prenom text,
  p_nom text,
  p_display_name text,
  p_username text
)
returns text
language sql
immutable
as $$
  select coalesce(nullif(btrim(concat_ws(' ', p_prenom, p_nom)), ''), nullif(p_display_name, ''), nullif(p_username, ''), 'Garde inconnu');
$$;

create or replace function public.mk_notify_absence_created(p_absence_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webhook text;
  v_rec record;
  v_content text;
begin
  if auth.uid() is null then
    raise exception 'Session requise.';
  end if;

  select
    a.id,
    a.user_id,
    a.starts_at,
    a.ends_at,
    a.reason_hrp,
    a.reason_rp,
    a.created_by,
    g.prenom,
    g.nom,
    g.grade,
    p.display_name,
    p.username
  into v_rec
  from public.mk_absences a
  left join public.mk_gardes g on g.user_id = a.user_id
  left join public.mk_profiles p on p.user_id = a.user_id
  where a.id = p_absence_id
  limit 1;

  if not found then
    raise exception 'Absence introuvable.';
  end if;

  if not (
    v_rec.user_id = auth.uid()
    or v_rec.created_by = auth.uid()
    or public.mk_can_edit_absences()
  ) then
    raise exception 'Permission insuffisante.';
  end if;

  begin
    select decrypted_secret
      into v_webhook
      from vault.decrypted_secrets
     where name = 'discord_webhook_absences'
     limit 1;
  exception when others then
    v_webhook := null;
  end;

  if v_webhook is null or v_webhook = '' then
    return;
  end if;

  v_content :=
    '📜 **Absence déclarée**' || E'\n\n' ||
    '> **Garde :** ' || public.mk_absence_discord_name(v_rec.prenom, v_rec.nom, v_rec.display_name, v_rec.username) ||
    case when nullif(v_rec.grade, '') is not null and v_rec.grade <> '—' then ' *(' || v_rec.grade || ')*' else '' end || E'\n' ||
    '> **Début :** ' || to_char(v_rec.starts_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI') || E'\n' ||
    '> **Fin :** ' || to_char(v_rec.ends_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI') ||
    case when nullif(v_rec.reason_hrp, '') is not null then E'\n' || '> **Motif HRP :** ' || left(v_rec.reason_hrp, 350) else '' end ||
    case when nullif(v_rec.reason_rp, '') is not null then E'\n' || '> **Motif RP :** ' || left(v_rec.reason_rp, 350) else '' end;

  perform net.http_post(
    url     := v_webhook,
    body    := jsonb_build_object('content', v_content),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
end;
$$;

create or replace function public.mk_notify_finished_absences()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_webhook text;
  v_rec record;
  v_content text;
  v_count integer := 0;
begin
  begin
    select decrypted_secret
      into v_webhook
      from vault.decrypted_secrets
     where name = 'discord_webhook_absences'
     limit 1;
  exception when others then
    v_webhook := null;
  end;

  if v_webhook is null or v_webhook = '' then
    return 0;
  end if;

  for v_rec in
    with finished as (
      update public.mk_absences a
         set ended_notified_at = now()
       where a.ends_at <= now()
         and a.ended_notified_at is null
       returning a.*
    )
    select
      f.*,
      g.prenom,
      g.nom,
      g.grade,
      p.display_name,
      p.username
    from finished f
    left join public.mk_gardes g on g.user_id = f.user_id
    left join public.mk_profiles p on p.user_id = f.user_id
  loop
    v_count := v_count + 1;

    begin
      if v_webhook is not null and v_webhook <> '' then
        v_content :=
          '✅ **Absence terminée**' || E'\n\n' ||
          '> **Garde :** ' || public.mk_absence_discord_name(v_rec.prenom, v_rec.nom, v_rec.display_name, v_rec.username) ||
          case when nullif(v_rec.grade, '') is not null and v_rec.grade <> '—' then ' *(' || v_rec.grade || ')*' else '' end || E'\n' ||
          '> **Fin prévue :** ' || to_char(v_rec.ends_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI') || E'\n' ||
          '-# Cette absence est maintenant rangée dans les archives du grimoire.';

        perform net.http_post(
          url     := v_webhook,
          body    := jsonb_build_object('content', v_content),
          headers := jsonb_build_object('Content-Type', 'application/json')
        );
      end if;
    exception when others then
      null;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.mk_absence_discord_name(text,text,text,text) from public;
revoke all on function public.mk_notify_absence_created(uuid) from public;
revoke all on function public.mk_notify_finished_absences() from public;
grant execute on function public.mk_notify_absence_created(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'mk-absence-end-notify') then
      perform cron.unschedule('mk-absence-end-notify');
    end if;
    perform cron.schedule(
      'mk-absence-end-notify',
      '*/5 * * * *',
      'select public.mk_notify_finished_absences();'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mk_absences'
  ) then
    alter publication supabase_realtime add table public.mk_absences;
  end if;
end $$;

-- Ouvre l'onglet Absences aux comptes existants.
-- Ne donne pas le droit d'édition global : chaque garde peut seulement gérer ses propres absences.
update public.mk_profiles
set sections = array_append(coalesce(sections, array[]::text[]), 'absences')
where user_id is not null
  and not ('absences' = any(coalesce(sections, array[]::text[])));
