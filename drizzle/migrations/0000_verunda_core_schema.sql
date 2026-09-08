-- ROLES ENUM
create type public.app_role as enum ('member','team_leader','super_admin');
create type public.outreach_channel as enum ('email','whatsapp','facebook','instagram','tiktok','linkedin');

-- TEAMS
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  leader_id uuid,
  leader_email text,
  created_at timestamptz not null default now()
);
grant select on public.teams to anon;
grant select, insert, update, delete on public.teams to authenticated;
grant all on public.teams to service_role;
alter table public.teams enable row level security;

-- PROFILES
create table public.profiles (
  id uuid primary key,
  email text not null,
  display_name text not null default '',
  avatar_url text,
  team_id uuid references public.teams(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- USER ROLES
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select, insert, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'super_admin')
$$;

create or replace function public.my_team_id()
returns uuid language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid()
$$;

create or replace function public.leads_team(_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = auth.uid() and r.role = 'team_leader' and p.team_id = _team_id
  )
$$;

-- UPLOADS
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  file_name text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.uploads to authenticated;
grant all on public.uploads to service_role;
alter table public.uploads enable row level security;

-- OUTREACH LINKS (single source of truth)
create table public.outreach_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  team_id uuid references public.teams(id) on delete set null,
  upload_id uuid references public.uploads(id) on delete cascade,
  source_file text,
  channel public.outreach_channel not null,
  contact_name text,
  contact_handle text not null,
  url text not null,
  raw_row jsonb,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, channel, contact_handle)
);
grant select, insert, update, delete on public.outreach_links to authenticated;
grant all on public.outreach_links to service_role;
alter table public.outreach_links enable row level security;
create index outreach_links_user_created_idx on public.outreach_links (user_id, created_at desc);
create index outreach_links_team_idx on public.outreach_links (team_id, created_at desc);
create index outreach_links_channel_idx on public.outreach_links (user_id, channel);
create index outreach_links_clicked_idx on public.outreach_links (user_id, clicked_at);

-- POLICIES
create policy "teams readable" on public.teams for select to authenticated, anon using (true);
create policy "super admin manage teams" on public.teams for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy "own profile select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_super_admin() or public.leads_team(team_id));
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_super_admin()) with check (id = auth.uid() or public.is_super_admin());
create policy "super admin delete profile" on public.profiles for delete to authenticated using (public.is_super_admin());

create policy "roles select" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy "roles insert self member" on public.user_roles for insert to authenticated
  with check ((user_id = auth.uid() and role = 'member') or public.is_super_admin());
create policy "roles delete" on public.user_roles for delete to authenticated using (public.is_super_admin());

create policy "uploads own" on public.uploads for all to authenticated
  using (user_id = auth.uid() or public.is_super_admin()) with check (user_id = auth.uid() or public.is_super_admin());

create policy "links select" on public.outreach_links for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin() or public.leads_team(team_id));
create policy "links insert" on public.outreach_links for insert to authenticated
  with check (user_id = auth.uid() or public.is_super_admin());
create policy "links update" on public.outreach_links for update to authenticated
  using (user_id = auth.uid() or public.is_super_admin()) with check (user_id = auth.uid() or public.is_super_admin());
create policy "links delete" on public.outreach_links for delete to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

-- SEED TEAMS
insert into public.teams (name) values ('Team Alpha'), ('Team Bravo'), ('Team Charlie');
