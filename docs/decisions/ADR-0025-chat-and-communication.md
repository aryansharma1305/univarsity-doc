# ADR-0025: Chat & Communication — student messages, verification queries, in-app notifications

- Status: Accepted
- Date: 2026-11-22

## Context

The admin workspace and the student portal showed "Chat & Communication" and "Notifications" as
unavailable. No email, SMS or WhatsApp delivery exists or is approved, and student records must
never be disclosed through support channels.

## Decision

1. **Student messages.** One private thread per conversation (`message_threads`), messages
   append-only (`thread_messages`, DB trigger). A student only ever sees their own threads (student
   from the session). Staff work a shared inbox: `studentMessages.read` to view,
   `studentMessages.respond` to reply/resolve/reopen (REGISTRAR, SUPER_ADMIN). Read state is a pair
   of markers (student / shared staff inbox). Students see replies as "University administration".
2. **Verification queries.** Students (session) and public requesters (no account) submit support
   queries with a `VQ-XXXXXXXX` reference. A public requester gets a one-time 24-character access
   code (stored only as an HMAC) and reads the answer with reference + code; every miss gets the
   same 404. Staff with `verificationQueries.read/.respond` answer (versioned) and resolve. Nothing
   looks up a record: answers are free text, and the staff form warns against disclosure.
3. **Notifications.** One row per recipient (`notifications`, exactly one of student/user, internal
   link CHECK), issued inside the event's transaction and idempotent (`dedupe_key`). Events: new
   student message (staff), staff reply (student), profile request approved/rejected, certificate
   request updates (not private review notes), student certificate responses (reviewers),
   verification query received (staff) / answered (student). Copy never contains message text,
   marks, reasons or identity values. Result notifications wait for result publication to be enabled.
4. **Safety.** Strict bodies, size limits, per-account/IP rate limits (messages 30/h, public queries
   5/h, status checks 30/h per IP and 10/h per reference), `no-store`, pre-auth CSRF on public
   routes, audits with IDs/kinds/statuses only.

Migration: `20261128090000_communication` (additive; sorts after Razorpay PR #49's migrations).

## Consequences

- Staff notification recipients are resolved from code-defined role permissions at event time.
- No retention period is set for messages or queries (university decision); nothing is deleted.
- External delivery (email/SMS) would need separate approval, consent and configuration.
