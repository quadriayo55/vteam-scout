-- 1. Saved message templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Sales',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_templates TO authenticated;
GRANT ALL ON public.email_templates TO service_role;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own templates read" ON public.email_templates;
CREATE POLICY "own templates read" ON public.email_templates
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_super_admin());
DROP POLICY IF EXISTS "own templates insert" ON public.email_templates;
CREATE POLICY "own templates insert" ON public.email_templates
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own templates update" ON public.email_templates;
CREATE POLICY "own templates update" ON public.email_templates
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own templates delete" ON public.email_templates;
CREATE POLICY "own templates delete" ON public.email_templates
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_super_admin());

CREATE INDEX IF NOT EXISTS email_templates_user_idx ON public.email_templates (user_id, created_at DESC);

-- 2. Multi-message rotation on bulk sends
ALTER TABLE public.bulk_sends
  ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rotation text NOT NULL DEFAULT 'alternate',
  ADD COLUMN IF NOT EXISTS rotation_size integer NOT NULL DEFAULT 1;

ALTER TABLE public.bulk_send_recipients
  ADD COLUMN IF NOT EXISTS variant integer NOT NULL DEFAULT 0;

-- 3. Streak / achievement source data
CREATE OR REPLACE FUNCTION public.email_sent_daily(_days integer DEFAULT 120, _user_id uuid DEFAULT auth.uid())
RETURNS TABLE(day date, sent bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ((r.sent_at AT TIME ZONE 'Africa/Lagos')::date) AS day, count(*)::bigint AS sent
  FROM public.bulk_send_recipients r
  WHERE r.user_id = coalesce(_user_id, auth.uid())
    AND r.status = 'sent'
    AND r.sent_at IS NOT NULL
    AND r.sent_at >= (now() - make_interval(days => greatest(_days, 1)))
  GROUP BY 1
  ORDER BY 1 DESC
$$;

CREATE OR REPLACE FUNCTION public.email_sent_total(_user_id uuid DEFAULT auth.uid())
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.bulk_send_recipients r
  WHERE r.user_id = coalesce(_user_id, auth.uid())
    AND r.status = 'sent'
$$;

GRANT EXECUTE ON FUNCTION public.email_sent_daily(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.email_sent_total(uuid) TO authenticated;