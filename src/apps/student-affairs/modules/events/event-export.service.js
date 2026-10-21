import { eventExportQueries as queries } from "../../../../services/gymkhana/eventExportQueries.service.js"
import { auditService } from "../../../../services/audit/audit.service.js"
import { success, notFound, badRequest } from "../../../../services/base/ServiceResponse.js"
import { renderEventReport, collectEventDocuments } from "./event-report.pdf.js"

// Follow every page; the interactive timeline caps individual requests at 200.
const history = async (entityType, entityId) => {
  const items = []
  let page = 1
  while (true) {
    const result = await auditService.getEntityHistory({ entityType, entityId, page, limit: 200 })
    if (!result.success) throw new Error("Could not load the complete event history")
    items.push(...result.data.items)
    if (!result.data.pagination.hasMore) break
    page += 1
  }
  return items.reverse()
}

export const eventExportService = {
  async export(id, { mega = false } = {}) {
    if (!/^[a-f\d]{24}$/i.test(id || "")) return badRequest("Invalid event ID")
    const event = await (mega ? queries.occurrence(id) : queries.event(id))
    if (!event) return notFound("Event not found")

    const sections = [{ title: "Event details", record: event, omit: ["proposal", "expense", "seriesId"] }]
    const histories = []
    if (mega) {
      sections.push({ title: "Mega-event series", record: event.seriesId })
      sections.push({ title: "Proposal", record: event.proposal, omit: ["history"] })
      sections.push({ title: "Bills and event report", record: event.expense, omit: ["history"] })
      for (const [title, record] of [["Proposal decisions", event.proposal], ["Expense decisions", event.expense]]) {
        histories.push({ title, items: record?.history || [] })
      }
      histories.push({ title: "Occurrence change history", items: await history("MegaEventOccurrence", id) })
    } else {
      const [calendar, proposals, expenses, amendments] = await Promise.all([
        event.calendarId ? queries.calendar(event.calendarId) : null,
        queries.proposals(id), queries.expenses(id), queries.amendments(event),
      ])
      sections.push({ title: "Activity calendar", record: calendar })
      for (const [title, records] of [["Proposal", proposals], ["Bills and event report", expenses], ["Calendar amendment", amendments]]) {
        if (!records.length) sections.push({ title, record: null })
        records.forEach((record, i) => sections.push({ title: records.length > 1 ? `${title} ${i + 1}` : title, record }))
      }
      const entities = [
        ["Event change history", "GymkhanaEvent", id],
        ...(calendar ? [["Calendar decisions and changes", "ActivityCalendar", calendar._id]] : []),
        ...proposals.map((p, i) => [`Proposal ${i + 1} decisions and changes`, "EventProposal", p._id]),
        ...expenses.map((e, i) => [`Expense ${i + 1} decisions and changes`, "EventExpense", e._id]),
        ...amendments.map((a, i) => [`Amendment ${i + 1} decisions and changes`, "CalendarAmendment", a._id]),
      ]
      histories.push(...await Promise.all(entities.map(async ([title, type, entityId]) => ({ title, items: await history(type, entityId) }))))
    }
    const generatedAt = new Date().toISOString()
    const documents = collectEventDocuments({ sections, histories })
    const bytes = await renderEventReport({ event, sections, histories, documents, generatedAt })
    return success({ title: event.title, generatedAt, reportPdf: bytes.toString("base64"), documents })
  },
}
