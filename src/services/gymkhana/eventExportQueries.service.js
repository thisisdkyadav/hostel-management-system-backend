/** Complete, access-safe projections for the event dossier. Never populate full users. */
import { GymkhanaEvent, EventProposal, EventExpense, ActivityCalendar, CalendarAmendment, MegaEventOccurrence } from "../../models/index.js"

const USER = "name email role subRole"
const actors = (query, paths) => {
  for (const path of paths) query.populate(path, USER)
  return query
}
const workflowActors = ["submittedBy", "rejectedBy", "approvedBy", "currentApproverUser", "customApprovalAssignments.userId"]

export const eventExportQueries = {
  event: (id) => GymkhanaEvent.findById(id).lean(),
  calendar: (id) => actors(ActivityCalendar.findById(id), ["createdBy", "rejectedBy", "lockedBy", "currentApproverUser", "customApprovalAssignments.userId"]).lean(),
  proposals: (eventId) => actors(EventProposal.find({ eventId }).sort({ createdAt: 1 }), workflowActors.filter((p) => p !== "approvedBy")).lean(),
  expenses: (eventId) => actors(EventExpense.find({ eventId }).sort({ createdAt: 1 }), workflowActors).lean(),
  amendments: (event) => actors(CalendarAmendment.find({ $or: [
    { eventId: event._id },
    // Older new-event amendments did not store the created event ID.
    { calendarId: event.calendarId, type: "new_event", eventId: { $exists: false }, "proposedChanges.title": event.title, "proposedChanges.startDate": event.scheduledStartDate },
  ] }).sort({ createdAt: 1 }), ["requestedBy", "reviewedBy"]).lean(),
  occurrence: (id) => actors(MegaEventOccurrence.findById(id).populate({ path: "seriesId", populate: { path: "createdBy", select: USER } }), [
    "createdBy", "proposal.submittedBy", "proposal.rejectedBy", "proposal.history.performedBy",
    "expense.submittedBy", "expense.rejectedBy", "expense.approvedBy", "expense.history.performedBy",
  ]).lean(),
}
