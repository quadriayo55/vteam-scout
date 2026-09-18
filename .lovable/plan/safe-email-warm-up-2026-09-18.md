# Safe email warm-up

## What will change
- Apply one shared sending limit across Bulk Outreach and Follow-Ups: at most 50 outreach emails per Lagos day.
- Pace delivery to at most one outreach email per minute, even when several sends or follow-up sequences are active.
- Make the server enforce these limits so closing the app or changing fields cannot bypass them.
- Change new-send controls and explanations to the safe defaults: one email per batch, 60 seconds apart, 50 per day.
- Keep the verified `support@verunda.com` sender, configurable Reply-To, branded `link.verunda.com` unsubscribe link, bounce/complaint suppression, and valid provider-generated Message-ID.

## Technical details
- Add an atomic per-sender pacing record so simultaneous background workers cannot release multiple messages together.
- Count successful bulk and follow-up deliveries toward the same daily warm-up allowance.
- Leave queued recipients pending when the daily allowance is reached, then continue automatically on the next Lagos day.
- Apply the database change, then verify the current build and the visible sending controls.

## Important expectation
No legitimate setup can guarantee Gmail's Primary inbox. Authentication is already healthy; this change removes the burst pattern and protects reputation. Inbox placement should improve gradually with clean, wanted sends and positive recipient engagement.
