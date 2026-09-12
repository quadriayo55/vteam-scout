-- 1. Recipient-level dynamic data + analytics
ALTER TABLE public.bulk_send_recipients
  ADD COLUMN IF NOT EXISTS row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_open_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_open_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_click_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_click_at timestamptz,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

CREATE INDEX IF NOT EXISTS bulk_send_recipients_provider_id_idx
  ON public.bulk_send_recipients (provider_id);
CREATE INDEX IF NOT EXISTS bulk_send_recipients_email_idx
  ON public.bulk_send_recipients (lower(email));

ALTER TABLE public.bulk_sends
  ADD COLUMN IF NOT EXISTS source_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS merge_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Idempotent provider event log
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  provider_id text,
  recipient_id uuid REFERENCES public.bulk_send_recipients(id) ON DELETE CASCADE,
  send_id uuid REFERENCES public.bulk_sends(id) ON DELETE CASCADE,
  user_id uuid,
  email text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.email_events TO authenticated;
GRANT ALL ON public.email_events TO service_role;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email events select" ON public.email_events
  FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.is_super_admin());

-- 3. Follow-up sequences
CREATE TABLE IF NOT EXISTS public.followup_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  send_id uuid NOT NULL REFERENCES public.bulk_sends(id) ON DELETE CASCADE,
  name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  send_hour integer NOT NULL DEFAULT 9,
  send_minute integer NOT NULL DEFAULT 0,
  audience_mode text NOT NULL DEFAULT 'non_responders',
  exclude_replied boolean NOT NULL DEFAULT true,
  exclude_clicked boolean NOT NULL DEFAULT true,
  exclude_opened boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  batch_size integer NOT NULL DEFAULT 20,
  gap_seconds integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_sequences TO authenticated;
GRANT ALL ON public.followup_sequences TO service_role;
ALTER TABLE public.followup_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sequences select" ON public.followup_sequences
  FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "sequences insert" ON public.followup_sequences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "sequences update" ON public.followup_sequences
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) OR public.is_super_admin())
  WITH CHECK ((user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "sequences delete" ON public.followup_sequences
  FOR DELETE TO authenticated USING ((user_id = auth.uid()) OR public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.followup_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 1,
  delay_days integer NOT NULL DEFAULT 1,
  anchor text NOT NULL DEFAULT 'original',
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  rotation text NOT NULL DEFAULT 'alternate',
  rotation_size integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_steps TO authenticated;
GRANT ALL ON public.followup_steps TO service_role;
ALTER TABLE public.followup_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "steps select" ON public.followup_steps
  FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "steps insert" ON public.followup_steps
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "steps update" ON public.followup_steps
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) OR public.is_super_admin())
  WITH CHECK ((user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "steps delete" ON public.followup_steps
  FOR DELETE TO authenticated USING ((user_id = auth.uid()) OR public.is_super_admin());

CREATE TABLE IF NOT EXISTS public.followup_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.followup_steps(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.followup_sequences(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.bulk_send_recipients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  variant integer NOT NULL DEFAULT 0,
  provider_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id, recipient_id)
);

GRANT SELECT ON public.followup_deliveries TO authenticated;
GRANT ALL ON public.followup_deliveries TO service_role;
ALTER TABLE public.followup_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deliveries select" ON public.followup_deliveries
  FOR SELECT TO authenticated USING ((user_id = auth.uid()) OR public.is_super_admin());

CREATE INDEX IF NOT EXISTS followup_steps_due_idx
  ON public.followup_steps (status, scheduled_at);

-- 4. Security: only administrators may change a profile's team
CREATE OR REPLACE FUNCTION public.guard_profile_team_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.team_id IS DISTINCT FROM OLD.team_id
     AND auth.uid() IS NOT NULL
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change team membership';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_team_change ON public.profiles;
CREATE TRIGGER guard_profile_team_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_team_change();