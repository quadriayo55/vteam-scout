DROP POLICY IF EXISTS "Signed in users can read suppressions" ON public.email_suppressions;
CREATE POLICY "Only super admins can read suppressions"
ON public.email_suppressions
FOR SELECT
TO authenticated
USING (public.is_super_admin());

DROP POLICY IF EXISTS "teams readable" ON public.teams;
CREATE POLICY "teams visible to members leaders and admins"
ON public.teams
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR leader_id = auth.uid()
  OR id = public.my_team_id()
);