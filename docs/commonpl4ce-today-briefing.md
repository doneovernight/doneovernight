# COMMONPL4CE Today Briefing

The Today Briefing is scoped to the authenticated Website OS workspace user and the `Europe/Amsterdam` calendar date.

## Eligibility

A booking appears when its persisted booking date is today and it is operationally active. Test, trashed, archived, cancelled, declined and rejected records are excluded. Completed or already-finished bookings appear only when their persisted payload explicitly marks follow-up as required.

Bookings with a known time are ordered by operational relevance and time: currently started, within 60 minutes, later today, then follow-up work. Untimed bookings remain available with a “time to confirm” state.

## Dismissal Rule

- The automatic sheet opens at most once for each eligible booking in one browser session.
- **Close** suppresses that booking for the rest of the current Amsterdam date.
- **View booking** opens the exact booking and suppresses the automatic sheet for that booking for the rest of the date.
- **Later** stores a 60-minute server-side snooze.
- Dismissal and snooze rows are keyed by workspace, authenticated user, booking reference and briefing date. They do not hide the briefing for other users or future dates.
- The Today dashboard card and navigation entry remain available after dismissal and can reopen all eligible bookings manually.

The server records each dismissal, view and snooze in the Website OS audit log. No booking content is copied into the dismissal table.
