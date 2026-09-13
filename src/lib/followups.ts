import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SequenceRow = {
  id: string;
  send_id: string;
  name: string;
  timezone: string;
  send_hour: number;
  send_minute: number;
  audience_mode: string;
  exclude_replied: boolean;
  exclude_clicked: boolean;
  exclude_opened: boolean;
  status: string;
  batch_size: number;
  gap_seconds: number;
  created_at: string;
};

export type StepRow = {
  id: string;
  sequence_id: string;
  position: number;
  delay_days: number;
  anchor: string;
  variants: unknown;
  rotation: string;
  rotation_size: number;
  status: string;
  scheduled_at: string | null;
  sent: number;
  failed: number;
  skipped: number;
  error: string | null;
};

export function useSequences(userId: string | undefined) {
  return useQuery({
    queryKey: ["followup-sequences", userId ?? null],
    enabled: Boolean(userId),
    refetchInterval: 30000,
    queryFn: async (): Promise<SequenceRow[]> => {
      const { data, error } = await supabase
        .from("followup_sequences")
        .select(
          "id,send_id,name,timezone,send_hour,send_minute,audience_mode,exclude_replied,exclude_clicked,exclude_opened,status,batch_size,gap_seconds,created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SequenceRow[];
    },
  });
}

export function useSteps(sequenceId: string | null) {
  return useQuery({
    queryKey: ["followup-steps", sequenceId],
    enabled: Boolean(sequenceId),
    refetchInterval: 20000,
    queryFn: async (): Promise<StepRow[]> => {
      const { data, error } = await supabase
        .from("followup_steps")
        .select(
          "id,sequence_id,position,delay_days,anchor,variants,rotation,rotation_size,status,scheduled_at,sent,failed,skipped,error",
        )
        .eq("sequence_id", sequenceId ?? "")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StepRow[];
    },
  });
}

/** Plain-language description of when a step goes out. */
export function stepTiming(delayDays: number, anchor: string, position: number) {
  const when = delayDays === 1 ? "1 day" : `${delayDays} days`;
  return anchor === "previous"
    ? `${when} after step ${position - 1 || 1}`
    : `${when} after the first email`;
}
