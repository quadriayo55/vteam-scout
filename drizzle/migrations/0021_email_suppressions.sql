CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'unsubscribed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_suppressions TO authenticated;
GRANT ALL ON public.email_suppressions TO service_role;

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed in users can read suppressions" ON public.email_suppressions;
CREATE POLICY "Signed in users can read suppressions"
ON public.email_suppressions
FOR SELECT
TO authenticated
USING (true);