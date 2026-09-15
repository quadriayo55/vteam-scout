ALTER TABLE public.bulk_sends ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE public.bulk_send_recipients ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS bulk_send_recipients_send_status_idx
  ON public.bulk_send_recipients (send_id, status, created_at);

-- Takes a short lease on a send so only one batch runner works on it at a time.
CREATE OR REPLACE FUNCTION public.try_lock_bulk_send(_send_id uuid, _seconds integer DEFAULT 300)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  got uuid;
begin
  update public.bulk_sends
     set locked_until = now() + make_interval(secs => greatest(coalesce(_seconds, 300), 30))
   where id = _send_id
     and status = 'sending'
     and (locked_until is null or locked_until < now())
  returning id into got;
  return got is not null;
end;
$$;

CREATE OR REPLACE FUNCTION public.release_bulk_send_lock(_send_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  update public.bulk_sends set locked_until = null where id = _send_id;
$$;

-- Atomically claims pending recipients so two runners can never pick the same row.
CREATE OR REPLACE FUNCTION public.claim_bulk_recipients(_send_id uuid, _limit integer)
RETURNS TABLE(id uuid, email text, contact_name text, variant integer, brand text, domain text, row_data jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  -- Recover rows claimed by a run that died before sending.
  update public.bulk_send_recipients r
     set status = 'pending', claimed_at = null
   where r.send_id = _send_id
     and r.status = 'claimed'
     and r.claimed_at < now() - interval '15 minutes';

  return query
  with picked as (
    select r.id
    from public.bulk_send_recipients r
    where r.send_id = _send_id and r.status = 'pending'
    order by r.created_at
    limit greatest(coalesce(_limit, 1), 1)
    for update skip locked
  )
  update public.bulk_send_recipients r
     set status = 'claimed', claimed_at = now()
   where r.id in (select p.id from picked p)
  returning r.id, r.email, r.contact_name, r.variant, r.brand, r.domain, r.row_data;
end;
$$;

GRANT EXECUTE ON FUNCTION public.try_lock_bulk_send(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_bulk_send_lock(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_bulk_recipients(uuid, integer) TO service_role;