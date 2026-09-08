CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  starts_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Lagos')::date),
  ends_on date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns readable" ON public.campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaigns insert admin" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "campaigns update admin" ON public.campaigns FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "campaigns delete admin" ON public.campaigns FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE TABLE public.campaign_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  target integer NOT NULL DEFAULT 0,
  assigned_by uuid,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, team_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_teams TO authenticated;
GRANT ALL ON public.campaign_teams TO service_role;
ALTER TABLE public.campaign_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign teams readable" ON public.campaign_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaign teams insert" ON public.campaign_teams FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR public.leads_team(team_id));
CREATE POLICY "campaign teams update" ON public.campaign_teams FOR UPDATE TO authenticated USING (public.is_super_admin() OR public.leads_team(team_id)) WITH CHECK (public.is_super_admin() OR public.leads_team(team_id));
CREATE POLICY "campaign teams delete" ON public.campaign_teams FOR DELETE TO authenticated USING (public.is_super_admin() OR public.leads_team(team_id));

CREATE INDEX campaign_teams_campaign_idx ON public.campaign_teams (campaign_id);

CREATE OR REPLACE FUNCTION public.campaign_progress(_campaign_id uuid)
RETURNS TABLE(team_id uuid, team_name text, target integer, joined_at timestamptz, generated bigint, clicked bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select ct.team_id,
         t.name,
         ct.target,
         ct.joined_at,
         count(l.id)::bigint,
         count(l.clicked_at)::bigint
  from public.campaign_teams ct
  join public.campaigns c on c.id = ct.campaign_id
  join public.teams t on t.id = ct.team_id
  left join public.outreach_links l
    on l.team_id = ct.team_id
   and ((l.created_at at time zone 'Africa/Lagos')::date) >= c.starts_on
   and ((l.created_at at time zone 'Africa/Lagos')::date) <= coalesce(c.ends_on, (now() at time zone 'Africa/Lagos')::date)
  where ct.campaign_id = _campaign_id
  group by ct.team_id, t.name, ct.target, ct.joined_at
  order by t.name;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_progress(uuid) TO authenticated;
