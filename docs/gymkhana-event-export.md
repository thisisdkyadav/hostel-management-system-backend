# Complete Gymkhana event PDF

The **Download complete event PDF** action appears in the event, proposal and
bill dialogs, and on a selected mega-event occurrence. It downloads saved data
at the current workflow stage; unsaved form changes are excluded.

The A4 report is typeset with PDFKit: a navy title, teal numbered chapter
headings, a contents overview, labelled fields, explicit INR amounts, UTC
decision dates and report page numbers. Long text and nested proposal details
flow onto additional pages. It is independent of the browser layout.

The report contains event details, calendar context, proposals, bill metadata,
event report details, event-linked amendments, and the complete decision and
change history of each entity. Mega-event occurrences include their series and
embedded proposal/expense histories. Missing sections are explicitly marked.
It exports every page of audit history, including submissions, approvals,
rejections, revision requests, comments, reasons, actors and recorded changes.

An attachment index is followed by the uploaded proposal, guest/speaker and
schedule PDFs, bill attachments, event reports and decision attachments.
Historical file references present in audit records are included. Identical
file references are appended once, with all their locations listed. Original
pages retain their sizes. The existing PDF rendering recovery is used when a
file cannot be copied normally. An unreadable/unavailable attachment fails the
whole export and identifies the attachment; no partial bundle is downloaded.

The export routes use the same authentication, role and route-access checks
as the respective event/mega-event view, and responses are not cacheable.
File downloads use the existing media resolution and API download service.
Soft-deleted proposals and expenses retain their existing visibility rules;
they are excluded from this normal event export. An old new-event amendment
without an event ID is matched by calendar, title and start date. If that event
was subsequently renamed/rescheduled, its original amendment may require a
separate administrative lookup. New approvals persist the event link.

Validation:

- In `backend/`: `npm run test:event-export` and `npm run check:boundary`.
- In `frontend/`: `npm run test:event-export` and `npm run build`.
- With the full app running, open an event before proposal submission, then
  one with reviewed proposals and bills; download and compare every saved
  section, actor, comment and attachment with the event. Repeat for an older
  mega-event occurrence. Check that inaccessible/missing attachments show an
  error and do not download a partial file.
