create or replace function public.can_view_user(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _user_id = auth.uid()
     or public.is_super_admin()
     or exists (
       select 1 from public.profiles p
       where p.id = _user_id and public.leads_team(p.team_id)
     )
$$;

-- Totals: single source of truth for every screen.
create or replace function public.outreach_totals(_user_id uuid default null, _team_id uuid default null, _since timestamptz default null)
returns table (generated bigint, clicked bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if _user_id is not null and not public.can_view_user(_user_id) then
    raise exception 'not authorized';
  end if;
  if _user_id is null and _team_id is not null and not (public.is_super_admin() or public.leads_team(_team_id)) then
    raise exception 'not authorized';
  end if;
  if _user_id is null and _team_id is null and not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  return query
  select count(*)::bigint,
         count(l.clicked_at)::bigint
  from public.outreach_links l
  where (_user_id is null or l.user_id = _user_id)
    and (_team_id is null or l.team_id = _team_id)
    and (_since is null or l.created_at >= _since);
end;
$$;

-- Daily breakdown in WAT, every calendar day represented.
create or replace function public.outreach_daily(_days integer, _user_id uuid default null, _team_id uuid default null)
returns table (
  day date,
  email_gen bigint, email_click bigint,
  whatsapp_gen bigint, whatsapp_click bigint,
  social_gen bigint, social_click bigint,
  total_gen bigint, total_click bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if _user_id is not null and not public.can_view_user(_user_id) then
    raise exception 'not authorized';
  end if;
  if _user_id is null and _team_id is not null and not (public.is_super_admin() or public.leads_team(_team_id)) then
    raise exception 'not authorized';
  end if;
  if _user_id is null and _team_id is null and not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  return query
  with days as (
    select (((now() at time zone 'Africa/Lagos')::date) - offs)::date as d
    from generate_series(0, greatest(_days,1) - 1) as offs
  ),
  rows as (
    select l.channel,
           ((l.created_at at time zone 'Africa/Lagos')::date) as gen_day,
           case when l.clicked_at is not null then ((l.clicked_at at time zone 'Africa/Lagos')::date) end as click_day
    from public.outreach_links l
    where (_user_id is null or l.user_id = _user_id)
      and (_team_id is null or l.team_id = _team_id)
      and l.created_at >= ((now() at time zone 'Africa/Lagos')::date - (greatest(_days,1) - 1)) at time zone 'Africa/Lagos'
  )
  select d.d,
    count(*) filter (where r.gen_day = d.d and r.channel = 'email')::bigint,
    count(*) filter (where r.click_day = d.d and r.channel = 'email')::bigint,
    count(*) filter (where r.gen_day = d.d and r.channel = 'whatsapp')::bigint,
    count(*) filter (where r.click_day = d.d and r.channel = 'whatsapp')::bigint,
    count(*) filter (where r.gen_day = d.d and r.channel not in ('email','whatsapp'))::bigint,
    count(*) filter (where r.click_day = d.d and r.channel not in ('email','whatsapp'))::bigint,
    count(*) filter (where r.gen_day = d.d)::bigint,
    count(*) filter (where r.click_day = d.d)::bigint
  from days d
  left join rows r on r.gen_day = d.d or r.click_day = d.d
  group by d.d
  order by d.d;
end;
$$;

-- Leaderboard, same source of truth.
create or replace function public.outreach_leaderboard(_days integer default 30, _team_id uuid default null)
returns table (
  user_id uuid,
  display_name text,
  email text,
  avatar_url text,
  team_id uuid,
  team_name text,
  generated bigint,
  clicked bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select p.id, p.display_name, p.email, p.avatar_url, p.team_id, t.name,
         count(l.id)::bigint,
         count(l.clicked_at)::bigint
  from public.profiles p
  left join public.teams t on t.id = p.team_id
  left join public.outreach_links l
    on l.user_id = p.id
   and l.created_at >= ((now() at time zone 'Africa/Lagos')::date - (greatest(_days,1) - 1)) at time zone 'Africa/Lagos'
  where p.is_active
    and (_team_id is null or p.team_id = _team_id)
  group by p.id, p.display_name, p.email, p.avatar_url, p.team_id, t.name
  order by count(l.clicked_at) desc, count(l.id) desc;
end;
$$;

grant execute on function public.outreach_totals(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.outreach_daily(integer, uuid, uuid) to authenticated;
grant execute on function public.outreach_leaderboard(integer, uuid) to authenticated;
grant execute on function public.can_view_user(uuid) to authenticated;