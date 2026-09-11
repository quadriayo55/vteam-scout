# Dynamic email data, per-list analytics, and follow-ups

## Goal
Turn every uploaded email list into a reusable, trackable send source: any CSV column can personalize messages, each list has recipient-level engagement reporting, and prior lists can power scheduled follow-up sequences.

## What will be built

### 1. Generic CSV merge tags
- Normalize every uploaded header consistently by trimming, lowercasing, and removing separators, so `Store Name`, `store_name`, and `STORE-NAME` all resolve to `storename`.
- Preserve the complete normalized row on each recipient, alongside the existing email, name, brand, and website fields.
- Replace every case-insensitive `{tag}` in subjects and bodies from that recipient’s stored row at send time.
- Preserve the current `{name}` fallback behavior when no name is available.
- Show the available tags after upload and block preparing a send when any subject/body tag is unavailable in the uploaded list.
- Apply the same resolver to test emails, saved templates, rotated messages, and follow-ups.

### 2. Per-list email analytics
- Treat each prepared bulk send as the permanent record for its uploaded/pasted list, including source file names and recipient rows.
- Store delivery, bounce, complaint, first/last open, open count, first/last click, click count, and reply timestamps per recipient.
- Add an idempotent event history so repeated provider notifications cannot inflate counts.
- Add a dedicated Email Analytics page with a list overview and a drill-down showing totals and recipient status for one send/list.
- Add navigation from “Your sends” and the lead-files area into the selected list’s report.
- Keep plain-looking email styling, but send the body as minimal HTML plus text so Resend can emit open/click events. This preserves the visual appearance; tracked pixels and links can still affect inbox classification, so placement cannot be guaranteed.

### 3. Resend event and reply intake
- Add a signed public webhook endpoint for Resend delivery, bounce, complaint, open, click, and inbound-reply events.
- Match events back to recipients using the Resend email ID already stored for every message.
- Use a dedicated inbound subdomain, defaulting to `reply.verunda.com`, so the MX records for the main `verunda.com` mailbox remain untouched.
- Use a reply address on that subdomain and forward a readable copy of each detected reply to `quadri@verunda.com`, while marking the recipient as replied in analytics.
- After the endpoint exists, provide its exact published URL and request the Resend webhook signing secret through the secure secret form. The user will add the shown MX records for only the reply subdomain and subscribe the webhook to the listed events in Resend.

### 4. Scheduled follow-up sequences
- Add a Follow Ups page where a previous send/list can be selected and named.
- Support ordered steps with one or more subject/body variants, saved follow-up templates, and alternate or random recipient rotation.
- Let each step delay be anchored either to the original send or the previous step, as selected per step.
- Schedule each step for a chosen local send time using the account’s saved timezone.
- Default the audience to “non-responders only,” with configurable exclusion signals: replied, clicked, and opened. “Send to everyone” remains one-click selectable.
- Evaluate exclusions immediately before each scheduled message so activity from earlier steps is respected.
- Show sequence status, next run, per-step progress, pause/resume, and recipient outcomes.

### 5. Durable scheduling with Inngest
- Use the newly connected Inngest account for durable delays and background execution, so follow-ups continue when the browser is closed.
- Add a signed Inngest endpoint and workflow that sleeps until each due step, rechecks audience rules, sends in controlled batches, and records outcomes.
- Expose failures in the sequence view without silently retrying invalid recipients or unresolved merge tags.
- After publishing, provide the exact endpoint to sync in Inngest.

### 6. Access control and safety
- Keep email sending, analytics, webhook configuration, and follow-up management restricted to the existing authorised roles.
- Validate all public webhook payloads and signatures before any update.
- Fix the active team-assignment security issue by preventing signed-in users from changing their own team; only an administrator may change team membership.
- Keep provider secrets server-side and make event handling idempotent.

## Technical details
- Add recipient JSON data and analytics fields, an email-event table, and follow-up sequence/step/delivery tables through additive migrations with row-level access rules and explicit grants.
- Reuse the current bulk send and template records rather than creating a second disconnected email system.
- Add shared header normalization, merge-tag extraction, validation, and rendering utilities used by both browser previews and server sends.
- Add TanStack public server routes for Resend and Inngest callbacks, authenticated server functions for sequence actions, and unique metadata for each new content page.
- Update the project roadmap and verify migrations, build output, webhook rejection behavior, merge-tag rendering, list analytics, and desktop/mobile sequence flows.

## Setup needed from you after implementation
1. In Resend, create the webhook using the URL shown by the app and select sent/delivered/bounced/complained/opened/clicked/received events.
2. Save its signing secret using the secure form I will open after the endpoint is ready.
3. Configure only `reply.verunda.com` for Resend inbound receiving using the exact DNS records Resend provides; do not change the root-domain MX records.
4. Enable Resend open and click tracking for the sending domain if it is currently disabled.
5. Sync the published Inngest endpoint once so it discovers the follow-up workflow.
