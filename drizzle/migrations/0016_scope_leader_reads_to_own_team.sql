DROP POLICY IF EXISTS "prospects readable to owners leaders admins" ON public.prospects;
CREATE POLICY "prospects readable to owners leaders admins"
ON public.prospects FOR SELECT TO authenticated
USING (created_by = auth.uid() OR assigned_to = auth.uid() OR is_super_admin() OR leads_team(team_id));

DROP POLICY IF EXISTS "invites readable to owners leaders admins" ON public.campaign_invites;
CREATE POLICY "invites readable to owners leaders admins"
ON public.campaign_invites FOR SELECT TO authenticated
USING (created_by = auth.uid() OR is_super_admin() OR leads_team(team_id));