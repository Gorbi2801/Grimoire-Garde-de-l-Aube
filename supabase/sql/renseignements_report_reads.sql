create table if not exists public.mk_rens_report_reads (
  report_id uuid not null references public.mk_rens_rapports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create index if not exists mk_rens_report_reads_user_idx
on public.mk_rens_report_reads(user_id, read_at desc);

-- Les rapports déjà existants au moment de l'installation ne doivent pas
-- apparaître comme "non lus" pour tout le monde.
insert into public.mk_rens_report_reads(report_id, user_id, read_at)
select r.id, p.user_id, now()
from public.mk_rens_rapports r
join public.mk_profiles p on p.user_id is not null
on conflict (report_id, user_id) do nothing;

alter table public.mk_rens_report_reads enable row level security;

drop policy if exists "read own rens report reads" on public.mk_rens_report_reads;
create policy "read own rens report reads"
on public.mk_rens_report_reads
for select
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_section('renseignements')
);

drop policy if exists "create own rens report reads" on public.mk_rens_report_reads;
create policy "create own rens report reads"
on public.mk_rens_report_reads
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.can_access_section('renseignements')
  and exists (
    select 1
    from public.mk_rens_rapports r
    where r.id = report_id
  )
);

drop policy if exists "update own rens report reads" on public.mk_rens_report_reads;
create policy "update own rens report reads"
on public.mk_rens_report_reads
for update
to authenticated
using (
  user_id = auth.uid()
  and public.can_access_section('renseignements')
)
with check (
  user_id = auth.uid()
  and public.can_access_section('renseignements')
);

revoke all on public.mk_rens_report_reads from anon;
revoke all on public.mk_rens_report_reads from authenticated;
grant select on public.mk_rens_report_reads to authenticated;
grant insert(report_id, user_id, read_at) on public.mk_rens_report_reads to authenticated;
grant update(read_at) on public.mk_rens_report_reads to authenticated;
