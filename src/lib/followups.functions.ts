import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sends any follow-up work that is already due, without waiting for the scheduler. */
export const runFollowupsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Only an administrator can run follow-ups.");
    const { runDueFollowups } = await import("./followups.server");
    return await runDueFollowups();
  });
