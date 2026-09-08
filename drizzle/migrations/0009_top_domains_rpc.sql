create or replace function public.outreach_top_domains(_days integer default 7, _user_id uuid default null, _team_id uuid default null, _limit integer default 8)
returns table(domain text, generated bigint, clicked bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $$
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
  select lower(
           coalesce(
             nullif(split_part(l.contact_handle, '@', 2), ''),
             regexp_replace(regexp_replace(l.url, '^https?://(www\.)?', ''), '/.*$', '')
           )
         ) as domain,
         count(*)::bigint,
         count(l.clicked_at)::bigint
  from public.outreach_links l
  where (_user_id is null or l.user_id = _user_id)
    and (_team_id is null or l.team_id = _team_id)
    and l.created_at >= ((now() at time zone 'Africa/Lagos')::date - (greatest(_days,1) - 1)) at time zone 'Africa/Lagos'
  group by 1
  having coalesce(nullif(split_part(l.contact_handle, '@', 2), ''), '') <> '' or true
  order by count(*) desc
  limit greatest(_limit, 1);
end;
$$;

grant execute on function public.outreach_top_domains(integer, uuid, uuid, integer) to authenticated, service_role;
