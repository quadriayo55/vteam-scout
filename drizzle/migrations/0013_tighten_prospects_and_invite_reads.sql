DROP POLICY IF EXISTS "prospects readable" ON public.prospects;

CREATE POLICY "prospects readable to owners leaders admins"
ON public.prospects
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR assigned_to = auth.uid()
  OR public.is_super_admin()
  OR public.has_role(auth.uid(), 'team_leader')
);

DROP POLICY IF EXISTS "invites readable" ON public.campaign_invites;

CREATE POLICY "invites readable to owners leaders admins"
ON public.campaign_invites
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_super_admin()
  OR public.has_role(auth.uid(), 'team_leader')
);