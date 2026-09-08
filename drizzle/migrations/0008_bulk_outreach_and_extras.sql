-- 1. domain channel + per-user timezone
alter type public.outreach_channel add value if not exists 'domain';

alter table public.profiles add column if not exists timezone text;

-- 2. bulk email sends via Resend
create table if not exists public.bulk_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_id uuid references public.teams(id) on delete set null,
  name text not null,
  from_name text not null,
  from_email text not null,
  reply_to text,
  subject text not null,
  body text not null,
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  batch_size integer not null default 20,
  gap_seconds integer not null default 60,
  daily_cap integer not null default 500,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_send_recipients (
  id uuid primary key default gen_random_uuid(),
  send_id uuid not null references public.bulk_sends(id) on delete cascade,
  user_id uuid not null,
  email text not null,
  contact_name text,
  domain text,
  status text not null default 'pending',
  error text,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (send_id, email)
);

create index if not exists bulk_send_recipients_send_status_idx
  on public.bulk_send_recipients (send_id, status);

grant select, insert, update, delete on public.bulk_sends to authenticated;
grant all on public.bulk_sends to service_role;
grant select, insert, update, delete on public.bulk_send_recipients to authenticated;
grant all on public.bulk_send_recipients to service_role;

alter table public.bulk_sends enable row level security;
alter table public.bulk_send_recipients enable row level security;

drop policy if exists "bulk sends select" on public.bulk_sends;
create policy "bulk sends select" on public.bulk_sends for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin() or public.leads_team(team_id));
drop policy if exists "bulk sends insert" on public.bulk_sends;
create policy "bulk sends insert" on public.bulk_sends for insert to authenticated
  with check (user_id = auth.uid() or public.is_super_admin());
drop policy if exists "bulk sends update" on public.bulk_sends;
create policy "bulk sends update" on public.bulk_sends for update to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());
drop policy if exists "bulk sends delete" on public.bulk_sends;
create policy "bulk sends delete" on public.bulk_sends for delete to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "bulk recipients select" on public.bulk_send_recipients;
create policy "bulk recipients select" on public.bulk_send_recipients for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin()
         or exists (select 1 from public.bulk_sends s where s.id = send_id and public.leads_team(s.team_id)));
drop policy if exists "bulk recipients insert" on public.bulk_send_recipients;
create policy "bulk recipients insert" on public.bulk_send_recipients for insert to authenticated
  with check (user_id = auth.uid() or public.is_super_admin());
drop policy if exists "bulk recipients update" on public.bulk_send_recipients;
create policy "bulk recipients update" on public.bulk_send_recipients for update to authenticated
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());
drop policy if exists "bulk recipients delete" on public.bulk_send_recipients;
create policy "bulk recipients delete" on public.bulk_send_recipients for delete to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
