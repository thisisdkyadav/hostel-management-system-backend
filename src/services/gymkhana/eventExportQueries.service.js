/** Access-safe projections for the event record export. Never populate full users. */
import { GymkhanaEvent, EventProposal, ActivityCalendar, MegaEventOccurrence } from "../../models/index.js"

const USER = "name email role subRole"
const actors = (query, paths) => {
  for (const path of paths) query.populate(path, USER)
  return query
}

export const eventExportQueries = {
  event: (id) => GymkhanaEvent.findById(id).lean(),
  calendar: (id) => ActivityCalendar.findById(id).select("academicYear categoryDefinitions").lean(),
  proposals: (eventId) => actors(EventProposal.find({ eventId }).sort({ createdAt: 1 }), ["submittedBy", "rejectedBy"]).lean(),
  occurrence: (id) => actors(MegaEventOccurrence.findById(id).populate("seriesId", "name"), [
    "proposal.submittedBy", "proposal.rejectedBy", "proposal.history.performedBy",
  ]).lean(),
}
