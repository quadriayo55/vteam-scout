-- Real outreach progress for a campaign: every email actually delivered inside
-- the campaign window, plus engagement, so campaign cards show live reality.
CREATE OR REPLACE FUNCTION public.campaign_email_totals(_campaign_id uuid)
RETURNS TABLE(emails_sent bigint, delivered bigint, opened bigint, replied bigint, bounced bigint, link_opens bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select
    count(r.id) filter (where r.status = 'sent')::bigint,
    count(r.delivered_at)::bigint,
    count(r.first_open_at)::bigint,
    count(r.replied_at)::bigint,
    count(r.bounced_at)::bigint,
    coalesce((select count(*) from public.campaign_invite_clicks k where k.campaign_id = c.id), 0)::bigint
  from public.campaigns c
  left join public.bulk_send_recipients r
    on r.sent_at is not null
   and ((r.sent_at at time zone 'Africa/Lagos')::date) >= c.starts_on
   and ((r.sent_at at time zone 'Africa/Lagos')::date) <= coalesce(c.ends_on, (now() at time zone 'Africa/Lagos')::date)
  where c.id = _campaign_id
  group by c.id;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_email_totals(uuid) TO authenticated, service_role;
