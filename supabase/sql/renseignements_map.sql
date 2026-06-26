create table if not exists public.mk_rens_map_nodes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.mk_rens_rapports(id) on delete cascade,
  x numeric(10,2) not null default 0,
  y numeric(10,2) not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id)
);

create table if not exists public.mk_rens_map_links (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid not null references public.mk_rens_map_nodes(id) on delete cascade,
  target_node_id uuid not null references public.mk_rens_map_nodes(id) on delete cascade,
  color text not null default '#8A1010' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (source_node_id <> target_node_id),
  unique (source_node_id, target_node_id)
);

create index if not exists mk_rens_map_nodes_report_idx on public.mk_rens_map_nodes(report_id);
create index if not exists mk_rens_map_nodes_created_idx on public.mk_rens_map_nodes(created_at desc);
create index if not exists mk_rens_map_links_source_idx on public.mk_rens_map_links(source_node_id);
create index if not exists mk_rens_map_links_target_idx on public.mk_rens_map_links(target_node_id);

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

alter table public.mk_rens_map_nodes enable row level security;
alter table public.mk_rens_map_links enable row level security;

drop policy if exists "read rens map nodes" on public.mk_rens_map_nodes;
create policy "read rens map nodes"
on public.mk_rens_map_nodes
for select
to authenticated
using (public.can_access_section('renseignements'));

drop policy if exists "create rens map nodes" on public.mk_rens_map_nodes;
create policy "create rens map nodes"
on public.mk_rens_map_nodes
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_edit_section('renseignements')
);

drop policy if exists "update rens map nodes" on public.mk_rens_map_nodes;
create policy "update rens map nodes"
on public.mk_rens_map_nodes
for update
to authenticated
using (public.can_edit_section('renseignements'))
with check (public.can_edit_section('renseignements'));

drop policy if exists "delete rens map nodes" on public.mk_rens_map_nodes;
create policy "delete rens map nodes"
on public.mk_rens_map_nodes
for delete
to authenticated
using (public.can_edit_section('renseignements'));

drop policy if exists "read rens map links" on public.mk_rens_map_links;
create policy "read rens map links"
on public.mk_rens_map_links
for select
to authenticated
using (public.can_access_section('renseignements'));

drop policy if exists "create rens map links" on public.mk_rens_map_links;
create policy "create rens map links"
on public.mk_rens_map_links
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_edit_section('renseignements')
);

drop policy if exists "update rens map links" on public.mk_rens_map_links;
create policy "update rens map links"
on public.mk_rens_map_links
for update
to authenticated
using (public.can_edit_section('renseignements'))
with check (public.can_edit_section('renseignements'));

drop policy if exists "delete rens map links" on public.mk_rens_map_links;
create policy "delete rens map links"
on public.mk_rens_map_links
for delete
to authenticated
using (public.can_edit_section('renseignements'));

revoke all on public.mk_rens_map_nodes from anon;
revoke all on public.mk_rens_map_nodes from authenticated;
grant select on public.mk_rens_map_nodes to authenticated;
grant insert(report_id, x, y, created_by) on public.mk_rens_map_nodes to authenticated;
grant update(x, y, updated_at) on public.mk_rens_map_nodes to authenticated;
grant delete on public.mk_rens_map_nodes to authenticated;

revoke all on public.mk_rens_map_links from anon;
revoke all on public.mk_rens_map_links from authenticated;
grant select on public.mk_rens_map_links to authenticated;
grant insert(source_node_id, target_node_id, color, created_by) on public.mk_rens_map_links to authenticated;
grant update(color) on public.mk_rens_map_links to authenticated;
grant delete on public.mk_rens_map_links to authenticated;
