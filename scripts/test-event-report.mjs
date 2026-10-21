import assert from "node:assert/strict"
import { test } from "node:test"
import { collectEventDocuments, renderEventReport } from "../src/apps/student-affairs/modules/events/event-report.pdf.js"

test("collects all current and historical PDF locations once in stable order", () => {
  const bundle = {
    sections: [{ title: "Proposal", record: { proposalDocumentUrl: "media://proposal", proposalDetails: { programmeSchedule: { detailedScheduleAnnexureUrl: "/uploads/schedule.pdf" } } } }, { title: "Bills", record: { bills: [{ attachments: [{ url: "media://bill" }] }], eventReportDocumentUrl: "https://storage.example/report.pdf?token=abc" } }],
    histories: [{ title: "Decisions", items: [{ attachments: [{ url: "media://approval" }], snapshot: { proposalDocumentUrl: "media://proposal" }, changes: [{ before: "media://old", after: "media://proposal" }] }] }],
  }
  const docs = collectEventDocuments(bundle)
  assert.deepEqual(docs.map((d) => d.url), ["media://proposal", "/uploads/schedule.pdf", "media://bill", "https://storage.example/report.pdf?token=abc", "media://approval", "media://old"])
  assert.equal(docs[0].locations.length, 3)
  assert.deepEqual(docs.map((d) => d.number), [1, 2, 3, 4, 5, 6])
})

test("renders a pre-proposal event and long multi-page decision history", async () => {
  const event = { _id: "123", title: "Annual Arts Festival", status: "upcoming", category: "Cultural" }
  const bytes = await renderEventReport({ event, generatedAt: "2026-10-21T10:00:00.000Z", sections: [{ title: "Event details", record: event }, { title: "Proposal", record: null }], documents: [], histories: [{ title: "Decisions", items: Array.from({ length: 210 }, (_, i) => ({ action: "approved", stage: "Student Affairs", actor: { name: `Reviewer ${i}` }, at: "2026-10-21T10:00:00.000Z", comments: `Decision ${i}: ` + "Full recorded comment. ".repeat(30) })) }] })
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-")
  assert.ok(bytes.length > 10000)
})
