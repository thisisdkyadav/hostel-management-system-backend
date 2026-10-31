import { eventExportQueries as queries } from "../../../../services/gymkhana/eventExportQueries.service.js"
import { approvalLogQueries } from "../../../../services/gymkhana/approvalLogQueries.service.js"
import { success, notFound, badRequest } from "../../../../services/base/ServiceResponse.js"
import { renderEventReport } from "./event-report.pdf.js"

const titleCase = (key = "") => String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()

const categoryLabel = (key, calendar) =>
  calendar?.categoryDefinitions?.find((definition) => definition.key === key)?.label || titleCase(key)

const person = (user) => (user && typeof user === "object" ? user.name || user.email || null : null)

const approvalEntry = (entry) => ({
  at: entry.createdAt,
  stage: entry.stage,
  action: entry.action,
  by: person(entry.performedBy),
  comments: entry.comments || "",
})

/** Only the papers that belong to the proposal travel with the record; bills stay out. */
const proposalDocuments = (proposal) =>
  [
    ["Signed proposal", proposal?.proposalDocumentUrl],
    ["Chief guest document", proposal?.chiefGuestDocumentUrl],
    ["Detailed programme schedule", proposal?.proposalDetails?.programmeSchedule?.detailedScheduleAnnexureUrl],
  ]
    .filter(([, url]) => typeof url === "string" && url.trim())
    .filter(([, url], i, all) => all.findIndex(([, other]) => other === url) === i)
    .map(([label, url], i) => ({ number: i + 1, label, url }))

const shapeProposal = (proposal, approvals) =>
  proposal && {
    status: proposal.status,
    currentApprovalStage: proposal.currentApprovalStage,
    submittedBy: person(proposal.submittedBy),
    // Embedded mega-event proposals carry no timestamps; fall back to the first submission.
    submittedAt: proposal.createdAt || approvals.find((entry) => entry.action === "submitted")?.at || null,
    approvedAt: proposal.approvedAt,
    rejectedAt: proposal.rejectedAt,
    rejectedBy: person(proposal.rejectedBy),
    rejectionReason: proposal.rejectionReason,
    revisionCount: proposal.revisionCount || 0,
    proposalText: proposal.proposalText,
    externalGuestsDetails: proposal.externalGuestsDetails,
    details: proposal.proposalDetails || {},
    totalExpectedIncome: proposal.totalExpectedIncome,
    totalExpenditure: proposal.totalExpenditure,
    budgetDeflection: proposal.budgetDeflection,
    eventBudgetAtSubmission: proposal.eventBudgetAtSubmission,
    accommodationRequired: proposal.accommodationRequired,
  }

export const eventExportService = {
  /**
   * A readable offline record: what the event details pop-up shows, the proposal
   * as the proposal modal presents it, and the proposal's approval decisions.
   */
  async export(id, { mega = false } = {}) {
    if (!/^[a-f\d]{24}$/i.test(id || "")) return badRequest("Invalid event ID")
    const event = await (mega ? queries.occurrence(id) : queries.event(id))
    if (!event) return notFound("Event not found")

    let calendar = null
    let proposal = null
    let approvals = []
    if (mega) {
      proposal = event.proposal || null
      approvals = (proposal?.history || []).map(approvalEntry)
    } else {
      const [calendarDoc, proposals] = await Promise.all([
        event.calendarId ? queries.calendar(event.calendarId) : null,
        queries.proposals(id),
      ])
      calendar = calendarDoc
      proposal = proposals.at(-1) || null
      if (proposal) approvals = (await approvalLogQueries.findLogsByEntity("EventProposal", proposal._id)).map(approvalEntry)
    }

    const documents = proposalDocuments(proposal)
    const report = {
      generatedAt: new Date(),
      event: {
        title: event.title,
        mega,
        kind: mega ? `Mega event${event.seriesId?.name ? ` · ${event.seriesId.name}` : ""}` : "Calendar event",
        academicYear: calendar?.academicYear || null,
        category: categoryLabel(event.category, calendar),
        status: event.status,
        startDate: event.scheduledStartDate,
        endDate: event.scheduledEndDate,
        estimatedBudget: mega ? null : event.estimatedBudget,
        proposalDueDate: event.proposalDueDate,
        description: event.description,
      },
      proposal: null,
      approvals: approvals.sort((a, b) => new Date(a.at) - new Date(b.at)),
      documents,
    }
    report.proposal = shapeProposal(proposal, report.approvals)
    const bytes = await renderEventReport(report)
    return success({ title: event.title, generatedAt: report.generatedAt.toISOString(), reportPdf: bytes.toString("base64"), documents })
  },
}
