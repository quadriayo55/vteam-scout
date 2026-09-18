# Reduce avoidable spam signals

## Changes
- Keep every Bulk Outreach and Follow-Up email on the verified `verunda.com` sender and branded `link.verunda.com` unsubscribe page.
- Remove unnecessary custom bulk-email headers while preserving the standards-required one-click unsubscribe headers and provider-generated Message-ID.
- Tighten sender, subject, body, and link validation before sending so malformed or suspicious messages are blocked rather than delivered.
- Enforce the shared server-side pacing consistently across immediate sends, background bulk work, and follow-ups.
- Keep bounce, complaint, unsubscribe, duplicate-recipient, and malformed-address suppression active for every sending path.
- Update the sending screens to explain any blocked message clearly.

## Verification
- Check domain authentication and tracking status through the connected Resend account.
- Test the shared sending payload and safety checks.
- Confirm the app builds successfully and no sending path bypasses the shared sender.

## Important limitation
These changes remove avoidable technical spam signals, but no application can guarantee Gmail Primary placement. Mailbox providers also use recipient engagement, complaint history, list quality, and sender reputation.
