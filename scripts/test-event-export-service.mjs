import assert from "node:assert/strict"
import { test, mock } from "node:test"
import { eventExportQueries as queries } from "../src/services/gymkhana/eventExportQueries.service.js"
import { auditService } from "../src/services/audit/audit.service.js"
import { eventExportService } from "../src/apps/student-affairs/modules/events/event-export.service.js"
const id = "68da9d93518b78999d740001"

test("rejects malformed IDs before database access", async () => {
  const result = await eventExportService.export("bad")
  assert.equal(result.statusCode, 400)
})

test("includes histories beyond 200 entries and approval attachments", async () => {
  const calls = []
  mock.method(queries, "event", async () => ({ _id: id, title: "Fixture", status: "upcoming" }))
  mock.method(queries, "proposals", async () => [{ _id: id, proposalText: "Full proposal" }])
  mock.method(queries, "expenses", async () => [])
  mock.method(queries, "amendments", async () => [])
  mock.method(auditService, "getEntityHistory", async ({entityType, page}) => {
    calls.push([entityType, page])
    const items = entityType === "EventProposal" && page === 2 ? [{ action: "approved", comments: "Oldest approval", attachments: [{ url: "media://old-approval" }] }] : []
    return {success:true,data:{items,pagination:{hasMore:entityType === "EventProposal" && page === 1}}}
  })
  try {
    const result = await eventExportService.export(id)
    assert.equal(result.success, true)
    assert.ok(calls.some(([type,page]) => type === "EventProposal" && page === 2))
    assert.equal(result.data.documents[0].url, "media://old-approval")
    assert.equal(Buffer.from(result.data.reportPdf, "base64").subarray(0,5).toString(), "%PDF-")
  } finally { mock.restoreAll() }
})

test("exports mega occurrence embedded proposal and expense decisions", async () => {
  mock.method(queries, "occurrence", async () => ({ _id: id, title: "Mega fixture", seriesId: {name:"Series"}, proposal: {history:[{stage:"Student Affairs",action:"approved",performedBy:{name:"Reviewer"},createdAt:"2026-10-20T00:00:00.000Z",comments:"Agreed"}],proposalDocumentUrl:"media://proposal"}, expense:{bills:[{attachments:[{url:"media://invoice"}]}],history:[]} }))
  mock.method(auditService, "getEntityHistory", async () => ({success:true,data:{items:[],pagination:{hasMore:false}}}))
  try {
    const result = await eventExportService.export(id, {mega:true})
    assert.equal(result.success, true)
    assert.deepEqual(result.data.documents.map(d => d.url), ["media://proposal","media://invoice"])
  } finally { mock.restoreAll() }
})
