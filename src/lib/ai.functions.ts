import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

export type AssistMode = "grammar" | "spam" | "rephrase" | "subject";

const PROMPTS: Record<AssistMode, string> = {
  grammar:
    "You are an editor for cold outreach emails. Fix spelling, grammar and punctuation only. Keep the meaning, tone, line breaks and any {name} placeholders exactly as they are. Reply with the corrected text and nothing else.",
  spam: "You review cold outreach copy for spam-filter risk. Reply in at most 5 short lines: first line 'Risk: low|medium|high', then the specific words or patterns that could trip Gmail or Outlook filters, then one concrete suggestion. No preamble.",
  rephrase:
    "You rewrite cold outreach copy so it reads naturally and human, shorter and warmer, without hype or salesy claims. Keep any {name} placeholders. Keep it under the same length. Reply with the rewritten text only.",
  subject:
    "You analyse cold email subject lines. Reply in at most 4 short lines: 'Score: N/10', one line on why, one line on spam risk, then a stronger alternative prefixed with 'Try: '. No preamble.",
};

export const writingAssist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mode: AssistMode; text: string }) => {
    const mode = input?.mode;
    if (!mode || !(mode in PROMPTS)) throw new Error("Unknown writing tool.");
    const text = String(input?.text ?? "").trim();
    if (!text) throw new Error("Write something first.");
    return { mode, text: text.slice(0, 4000) };
  })
  .handler(async ({ data }): Promise<{ result: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("The writing tools are not available right now.");

    const response = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: PROMPTS[data.mode] },
          { role: "user", content: data.text },
        ],
      }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      console.error(`[writing-assist] failed [${response.status}]: ${bodyText}`);
      if (response.status === 429) throw new Error("Too many requests — try again in a moment.");
      if (response.status === 402) throw new Error("The writing tools need more credits.");
      throw new Error("The writing tools could not answer just now.");
    }

    let result = "";
    try {
      const json = JSON.parse(bodyText) as {
        choices?: { message?: { content?: string } }[];
      };
      result = json.choices?.[0]?.message?.content?.trim() ?? "";
    } catch {
      result = "";
    }
    if (!result) throw new Error("The writing tools returned nothing usable.");
    return { result };
  });
