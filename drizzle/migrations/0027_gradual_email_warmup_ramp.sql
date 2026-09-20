-- verunda.com was registered roughly two weeks before this migration (~2026-09-06).
-- A flat 1,000/day cap is still far too aggressive for a domain this young: mailbox
-- providers judge a new domain on a gradually increasing, consistent sending pattern,
-- not a flat ceiling reached on day one. Replace the flat cap with an automatic ramp
-- that increases the daily allowance week over week, so nobody has to remember to
-- raise it manually again (that manual-bump pattern is what pushed it to 5,000/day
-- previously). Adjust warmup_start below if the domain's real registration date differs.
CREATE OR REPLACE FUNCTION public.claim_email_send_slot(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pacing public.email_send_pacing%ROWTYPE;
  sent_today integer;
  day_start timestamptz := ((now() AT TIME ZONE 'Africa/Lagos')::date AT TIME ZONE 'Africa/Lagos');
  warmup_start date := DATE '2026-09-06';
  days_live integer := GREATEST(0, (day_start::date - warmup_start));
  daily_cap integer := CASE
    WHEN days_live < 7  THEN 30    -- week 1
    WHEN days_live < 14 THEN 60    -- week 2
    WHEN days_live < 21 THEN 120   -- week 3
    WHEN days_live < 28 THEN 200   -- week 4
    WHEN days_live < 35 THEN 350   -- week 5
    WHEN days_live < 42 THEN 500   -- week 6
    ELSE 750                       -- steady-state ceiling; raise manually only after sustained clean sending
  END;
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

  IF sent_today >= daily_cap THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'daily_limit',
      'sentToday', sent_today,
      'dailyCap', daily_cap,
      'retryAt', day_start + interval '1 day'
    );
  END IF;

  IF pacing.next_send_at > now() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'pacing',
      'sentToday', sent_today,
      'dailyCap', daily_cap,
      'retryAt', pacing.next_send_at
    );
  END IF;

  UPDATE public.email_send_pacing
  SET next_send_at = now() + interval '30 seconds', updated_at = now()
  WHERE user_id = _user_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'ready',
    'sentToday', sent_today,
    'dailyCap', daily_cap,
    'retryAt', now() + interval '30 seconds'
  );
END;
$function$;
