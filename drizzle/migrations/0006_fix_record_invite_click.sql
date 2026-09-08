CREATE OR REPLACE FUNCTION public.record_invite_click(_code text, _referrer text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS TABLE(campaign_id uuid, team_id uuid, campaign_name text, team_name text, clicks integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  inv public.campaign_invites;
begin
  select ci.* into inv from public.campaign_invites ci where ci.code = _code;
  if inv.id is null then
    return;
  end if;

  update public.campaign_invites ci
     set clicks = ci.clicks + 1, last_clicked_at = now()
   where ci.id = inv.id
   returning ci.* into inv;

  insert into public.campaign_invite_clicks (invite_id, campaign_id, team_id, referrer, user_agent)
  values (inv.id, inv.campaign_id, inv.team_id, _referrer, _user_agent);

  insert into public.campaign_teams as ct (campaign_id, team_id, target, joined_at)
  values (inv.campaign_id, inv.team_id, 0, now())
  on conflict (campaign_id, team_id)
  do update set joined_at = coalesce(ct.joined_at, now());

  return query
  select inv.campaign_id, inv.team_id, c.name, t.name, inv.clicks
  from public.campaigns c
  join public.teams t on t.id = inv.team_id
  where c.id = inv.campaign_id;
end;
$$;