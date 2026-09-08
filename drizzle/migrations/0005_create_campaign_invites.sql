CREATE TABLE public.campaign_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  label text,
  created_by uuid,
  clicks integer NOT NULL DEFAULT 0,
  last_clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, team_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_invites TO authenticated;
GRANT ALL ON public.campaign_invites TO service_role;
ALTER TABLE public.campaign_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites readable" ON public.campaign_invites FOR SELECT TO authenticated USING (true);
CREATE POLICY "invites insert" ON public.campaign_invites FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR public.leads_team(team_id));
CREATE POLICY "invites update" ON public.campaign_invites FOR UPDATE TO authenticated USING (public.is_super_admin() OR public.leads_team(team_id)) WITH CHECK (public.is_super_admin() OR public.leads_team(team_id));
CREATE POLICY "invites delete" ON public.campaign_invites FOR DELETE TO authenticated USING (public.is_super_admin() OR public.leads_team(team_id));

CREATE TABLE public.campaign_invite_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.campaign_invites(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  referrer text,
  user_agent text,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.campaign_invite_clicks TO authenticated;
GRANT ALL ON public.campaign_invite_clicks TO service_role;
ALTER TABLE public.campaign_invite_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite clicks readable" ON public.campaign_invite_clicks FOR SELECT TO authenticated USING (public.is_super_admin() OR public.leads_team(team_id));

CREATE INDEX campaign_invite_clicks_invite_idx ON public.campaign_invite_clicks (invite_id, clicked_at DESC);

CREATE OR REPLACE FUNCTION public.record_invite_click(_code text, _referrer text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS TABLE(campaign_id uuid, team_id uuid, campaign_name text, team_name text, clicks integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  inv public.campaign_invites;
begin
  select * into inv from public.campaign_invites where code = _code;
  if inv.id is null then
    return;
  end if;

  update public.campaign_invites
     set clicks = clicks + 1, last_clicked_at = now()
   where id = inv.id
   returning * into inv;

  insert into public.campaign_invite_clicks (invite_id, campaign_id, team_id, referrer, user_agent)
  values (inv.id, inv.campaign_id, inv.team_id, _referrer, _user_agent);

  insert into public.campaign_teams (campaign_id, team_id, target, joined_at)
  values (inv.campaign_id, inv.team_id, 0, now())
  on conflict (campaign_id, team_id)
  do update set joined_at = coalesce(public.campaign_teams.joined_at, now());

  return query
  select inv.campaign_id, inv.team_id, c.name, t.name, inv.clicks
  from public.campaigns c, public.teams t
  where c.id = inv.campaign_id and t.id = inv.team_id;
end;
$$;

GRANT EXECUTE ON FUNCTION public.record_invite_click(text, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.campaign_engagement(_campaign_id uuid)
RETURNS TABLE(team_id uuid, team_name text, target integer, joined_at timestamp with time zone, generated bigint, clicked bigint, link_opens integer, last_open timestamp with time zone, invite_code text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select p.team_id, p.team_name, p.target, p.joined_at, p.generated, p.clicked,
         coalesce(i.clicks, 0), i.last_clicked_at, i.code
  from public.campaign_progress(_campaign_id) p
  left join public.campaign_invites i
    on i.campaign_id = _campaign_id and i.team_id = p.team_id
  order by p.team_name;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_engagement(uuid) TO authenticated, service_role;