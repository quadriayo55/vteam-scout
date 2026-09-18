CREATE TABLE public.email_send_pacing (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  next_send_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.email_send_pacing TO service_role;

ALTER TABLE public.email_send_pacing ENABLE ROW LEVEL SECURITY;

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

  IF sent_today >= 50 THEN
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
  SET next_send_at = now() + interval '1 minute', updated_at = now()
  WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'ready',
    'sentToday', sent_today,
    'retryAt', now() + interval '1 minute'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_send_slot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_email_send_slot(uuid) TO service_role;