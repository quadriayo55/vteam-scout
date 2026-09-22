-- Indexes that make history clean-up and daily counting fast.
CREATE INDEX IF NOT EXISTS email_events_recipient_id_idx ON public.email_events (recipient_id);
CREATE INDEX IF NOT EXISTS email_events_send_id_idx ON public.email_events (send_id);
CREATE INDEX IF NOT EXISTS followup_deliveries_recipient_id_idx ON public.followup_deliveries (recipient_id);
CREATE INDEX IF NOT EXISTS followup_deliveries_user_sent_idx ON public.followup_deliveries (user_id, status, sent_at);
CREATE INDEX IF NOT EXISTS bulk_send_recipients_user_sent_idx ON public.bulk_send_recipients (user_id, status, sent_at);
CREATE INDEX IF NOT EXISTS bulk_send_recipients_claim_idx ON public.bulk_send_recipients (send_id, status, claimed_at);
CREATE INDEX IF NOT EXISTS bulk_sends_user_created_idx ON public.bulk_sends (user_id, created_at DESC);

-- One-shot delete of a send and everything hanging off it.
CREATE OR REPLACE FUNCTION public.delete_bulk_send(_send_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner uuid;
BEGIN
  SELECT user_id INTO owner FROM public.bulk_sends WHERE id = _send_id;
  IF owner IS NULL THEN
    RETURN false;
  END IF;
  IF owner <> auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not allowed to delete this send';
  END IF;

  DELETE FROM public.email_events WHERE send_id = _send_id;
  DELETE FROM public.followup_deliveries fd
   USING public.followup_sequences fs
   WHERE fd.sequence_id = fs.id AND fs.send_id = _send_id;
  DELETE FROM public.bulk_send_recipients WHERE send_id = _send_id;
  DELETE FROM public.bulk_sends WHERE id = _send_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_bulk_send(uuid) TO authenticated;

-- Faster pacing: one message every 6 seconds instead of 15.
CREATE OR REPLACE FUNCTION public.claim_email_send_slot(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pacing public.email_send_pacing%ROWTYPE;
  sent_today integer;
  day_start timestamptz := ((now() AT TIME ZONE 'Africa/Lagos')::date AT TIME ZONE 'Africa/Lagos');
BEGIN
  INSERT INTO public.email_send_pacing (user_id)
  VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO pacing
  FROM public.email_send_pacing
  WHERE user_id = _user_id
  FOR UPDATE;

  SELECT
    (SELECT count(*) FROM public.bulk_send_recipients
      WHERE user_id = _user_id AND status = 'sent' AND sent_at >= day_start)
    +
    (SELECT count(*) FROM public.followup_deliveries
      WHERE user_id = _user_id AND status = 'sent' AND sent_at >= day_start)
  INTO sent_today;

  IF sent_today >= 5000 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'sentToday', sent_today,
      'retryAt', day_start + interval '1 day'
    );
  END IF;

  IF pacing.next_send_at > now() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'pacing',
      'sentToday', sent_today,
      'retryAt', pacing.next_send_at
    );
  END IF;

  UPDATE public.email_send_pacing
  SET next_send_at = now() + interval '6 seconds', updated_at = now()
  WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'ready',
    'sentToday', sent_today,
    'retryAt', now() + interval '6 seconds'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_email_send_slot(uuid) TO service_role;