ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS import_batch uuid,
  ADD COLUMN IF NOT EXISTS source_file text;

CREATE INDEX IF NOT EXISTS prospects_import_batch_idx ON public.prospects (import_batch);

DROP POLICY IF EXISTS "teams readable" ON public.teams;
CREATE POLICY "teams readable" ON public.teams
  FOR SELECT TO authenticated
  USING (true);
REVOKE SELECT ON public.teams FROM anon;