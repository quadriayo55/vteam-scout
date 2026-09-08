ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS target integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.campaign_totals(_campaign_id uuid)
RETURNS TABLE(generated bigint, clicked bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select count(l.id)::bigint, count(l.clicked_at)::bigint
  from public.campaigns c
  left join public.outreach_links l
    on ((l.created_at at time zone 'Africa/Lagos')::date) >= c.starts_on
   and ((l.created_at at time zone 'Africa/Lagos')::date) <= coalesce(c.ends_on, (now() at time zone 'Africa/Lagos')::date)
  where c.id = _campaign_id;
$$;

GRANT EXECUTE ON FUNCTION public.campaign_totals(uuid) TO authenticated;