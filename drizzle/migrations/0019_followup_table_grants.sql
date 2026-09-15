-- Follow-up tables were created without Data API grants, so every read and
-- write from the app or the background worker was denied.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_sequences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_steps TO authenticated;
GRANT SELECT ON public.followup_deliveries TO authenticated;

GRANT ALL ON public.followup_sequences TO service_role;
GRANT ALL ON public.followup_steps TO service_role;
GRANT ALL ON public.followup_deliveries TO service_role;