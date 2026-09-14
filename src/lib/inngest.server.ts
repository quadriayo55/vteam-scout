import { Inngest } from "inngest";
import { serve } from "inngest/edge";
import { runDueFollowups } from "./followups.server";

/**
 * Background scheduling. Inngest calls this endpoint on a schedule, so
 * follow-ups keep going out at their planned times even when nobody has the
 * app open.
 */
export const inngest = new Inngest({ id: "verunda-team-scoutier" });

const followupTick = inngest.createFunction(
  {
    id: "followup-tick",
    triggers: [{ cron: "*/5 * * * *" }, { event: "followups/run" }],
  },
  async () => await runDueFollowups(),
);

export const inngestHandler = serve({ client: inngest, functions: [followupTick] });
