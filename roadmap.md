# Verunda Team Scoutier — roadmap

## Done
- Backend: teams, profiles, roles, uploads, outreach_links, RLS + grants, stats RPCs, avatar storage
- Sign up / sign in / forgot + reset password, team choice, role auto-assignment
- Landing page
- Outreach Links: file upload, channel detection, link generation, spam check, click tracking
- Dashboard, Analytics (today/7/30 days, WAT), Leaderboard (1/7/30 days)
- Team: roster, member drill-down, super-admin team creation, role assignment, member moves, data wipes
- Settings: display name, profile photo, password change, deactivate account

- Campaigns: create campaigns, per-team targets, team sign-ups, automatic progress (done)
- Team Links: unique tracked link per team + campaign, counts every open, signs the team up automatically; opens shown on campaign cards
- First real campaign created: September Shopify Push (8–30 Sep 2026), Alpha 500 / Bravo 300 / Charlie 300, Team Alpha signed up

- Bulk Outreach: real email sending through Resend, per-send pacing (batch size, gap, daily limit), live progress, spam check, paste or file recipients
- Domain column in lead files + Domain channel, Top domains + Live activity panels, "Your usage" panel, per-person timezone for activity times

- Prospect Scouting page: business, website, country, contacts, fit score, stage, team/scout/campaign assignment, search + filters
- Activity Log: team sign-ups, campaign link opens and every email sent/failed in one filterable timeline
- Campaign link-opens chart on Analytics
- Faster page switching (pages pre-load on hover, data kept warm)
- Real bulk send confirmed delivered from quadri@verunda.com to quadriayo55@gmail.com

## Open
- Verunda Team AI: personalised message generator + conclusion message + deal-closed toggle + chat revisions
- PC AutoScoutier: import outreach links as Gmail compose links
- Send verification/reset emails from "Verunda Team Scoutier" branding (done)
- Follow Ups page + Email Reports page + dynamic merge tags (done this turn)
- Save RESEND_WEBHOOK_SECRET in project secrets and add the webhook URL in Resend
- Replace the text wordmark with the real logo (waiting on the logo file from you)
- Bulk sending now runs server-side via Inngest (`bulk/send.start` event + `bulk-send-sweep` cron); Start/Stop buttons control it. After publishing, sync the Inngest endpoint once so the new jobs are discovered.

- Background sending no longer depends on Inngest sync: a database heartbeat (cron "bulk-send-tick", every minute) calls /api/public/hooks/bulk-tick (auth: BULK_TICK_SECRET header) which advances each running send by one batch and runs due follow-ups. Requires the app to be published.
- Duplicate sends fixed: one runner per send (try_lock_bulk_send/release_bulk_send_lock), contacts claimed before sending (claim_bulk_recipients, 15-min recovery), sent/failed totals recounted from rows.
- Shared sender protection: Bulk Outreach, Follow-Ups, and tests share a server-enforced 5,000-email daily limit and one-message-per-15-seconds pace.

- Removed Scouting and Lead Lists pages (leads now come straight from Bulk Outreach uploads)
- Campaigns: tracked links per team can be created/copied/removed on the campaign card; progress now counts real emails sent, inbox deliveries, replies and link opens (campaign_email_totals); pause/continue button
- Deliverability: every recipient domain is checked for a mail server before the first email; domains that cannot receive mail are skipped and remembered (cuts the ~8% bounce rate that was pushing mail to spam)
