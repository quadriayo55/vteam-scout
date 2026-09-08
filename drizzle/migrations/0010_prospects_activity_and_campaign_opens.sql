create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  website text,
  country text,
  notes text,
  email text,
  phone text,
  instagram text,
  facebook text,
  tiktok text,
  linkedin text,
  score integer not null default 50,
  stage text not null default 'new',
  team_id uuid references public.teams(id) on delete set null,
  assigned_to uuid,
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_team_idx on public.prospects(team_id);
create index if not exists prospects_stage_idx on public.prospects(stage);

grant select, insert, update, delete on public.prospects to authenticated;
grant all on public.prospects to service_role;

alter table public.prospects enable row level security;

create policy "prospects readable" on public.prospects
  for select to authenticated using (true);

create policy "prospects insert" on public.prospects
  for insert to authenticated with check (created_by = auth.uid() or public.is_super_admin());

create policy "prospects update" on public.prospects
  for update to authenticated
  using (created_by = auth.uid() or assigned_to = auth.uid() or public.is_super_admin() or public.leads_team(team_id))
  with check (created_by = auth.uid() or assigned_to = auth.uid() or public.is_super_admin() or public.leads_team(team_id));

create policy "prospects delete" on public.prospects
  for delete to authenticated using (created_by = auth.uid() or public.is_super_admin());

create or replace function public.campaign_opens_summary()
returns table(campaign_id uuid, name text, starts_on date, ends_on date, is_active boolean,
              opens bigint, teams_joined bigint, generated bigint, clicked bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.starts_on, c.ends_on, c.is_active,
         coalesce((select sum(i.clicks) from public.campaign_invites i where i.campaign_id = c.id), 0)::bigint,
         (select count(*) from public.campaign_teams ct where ct.campaign_id = c.id and ct.joined_at is not null)::bigint,
         coalesce((select count(l.id) from public.campaign_teams ct
                    join public.outreach_links l on l.team_id = ct.team_id
                   where ct.campaign_id = c.id
                     and ((l.created_at at time zone 'Africa/Lagos')::date) >= c.starts_on
                     and ((l.created_at at time zone 'Africa/Lagos')::date) <= coalesce(c.ends_on, (now() at time zone 'Africa/Lagos')::date)), 0)::bigint,
         coalesce((select count(l.clicked_at) from public.campaign_teams ct
                    join public.outreach_links l on l.team_id = ct.team_id
                   where ct.campaign_id = c.id
                     and ((l.created_at at time zone 'Africa/Lagos')::date) >= c.starts_on
                     and ((l.created_at at time zone 'Africa/Lagos')::date) <= coalesce(c.ends_on, (now() at time zone 'Africa/Lagos')::date)), 0)::bigint
  from public.campaigns c
  order by c.starts_on desc, c.name;
$$;

create or replace function public.activity_feed(_limit integer default 100, _campaign_id uuid default null)
returns table(kind text, happened_at timestamptz, title text, detail text,
              team_id uuid, team_name text, campaign_id uuid, campaign_name text)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (select public.is_super_admin() as admin, public.my_team_id() as tid)
  select * from (
    select 'team_joined'::text, ct.joined_at, t.name || ' signed up', 'Target ' || ct.target,
           t.id, t.name, c.id, c.name
    from public.campaign_teams ct
    join public.teams t on t.id = ct.team_id
    join public.campaigns c on c.id = ct.campaign_id, mine m
    where ct.joined_at is not null
      and (_campaign_id is null or ct.campaign_id = _campaign_id)
      and (m.admin or public.leads_team(ct.team_id) or ct.team_id = m.tid)

    union all
    select 'link_open'::text, k.clicked_at, t.name || ' opened its campaign link',
           coalesce(k.referrer, 'Direct'), t.id, t.name, c.id, c.name
    from public.campaign_invite_clicks k
    join public.teams t on t.id = k.team_id
    join public.campaigns c on c.id = k.campaign_id, mine m
    where (_campaign_id is null or k.campaign_id = _campaign_id)
      and (m.admin or public.leads_team(k.team_id) or k.team_id = m.tid)

    union all
    select case when r.status = 'sent' then 'email_sent' else 'email_failed' end,
           coalesce(r.sent_at, r.created_at),
           case when r.status = 'sent' then 'Email sent to ' || r.email else 'Email failed for ' || r.email end,
           coalesce(nullif(r.error, ''), s.subject), null::uuid, null::text, null::uuid, null::text
    from public.bulk_send_recipients r
    join public.bulk_sends s on s.id = r.send_id, mine m
    where r.status in ('sent','failed')
      and _campaign_id is null
      and (m.admin or r.user_id = auth.uid())
  ) rows(kind, happened_at, title, detail, team_id, team_name, campaign_id, campaign_name)
  where happened_at is not null
  order by happened_at desc
  limit greatest(coalesce(_limit, 100), 1);
$$;