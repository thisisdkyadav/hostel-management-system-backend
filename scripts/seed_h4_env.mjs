/**
 * Copy the 284 manual H4 cases into the LOCAL database selected by backend/.env.
 * Includes only fixture dependencies, rebuilds stored files and access links,
 * and never updates existing records, settings, counters, sessions or mail jobs.
 * Run from backend: node scripts/seed_h4_env.mjs
 */
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"
import dotenv from "dotenv"
import mongoose from "mongoose"

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const root = path.dirname(backend)
const cfg = dotenv.parse(await fs.readFile(path.join(backend, ".env"), "utf8"))
const uri = new URL(cfg.MONGO_URI)
assert(["localhost", "127.0.0.1"].includes(uri.hostname), "Fixture import is restricted to local MongoDB")
const database = decodeURIComponent(uri.pathname.slice(1))
assert(database && !["admin", "config", "local", "hms_integration_tests_h4_preview"].includes(database))
assert.notEqual(cfg.NODE_ENV, "production")
Object.assign(process.env, cfg, { NODE_ENV: "development", SMTP_USER: "", SMTP_PASS: "", SMTP_ACCOUNTS: "[]" })

const sourceState = JSON.parse(await fs.readFile(path.join(root, "artifacts/h4-manual-check/seed-state.json"), "utf8"))
assert.equal(Object.keys(sourceState.cases).length, 284)
const output = path.join(root, "artifacts/h4-manual-check", database)
await fs.mkdir(output, { recursive: true })
const statePath = path.join(output, "import-state.json")
const state = await fs.readFile(statePath, "utf8").then(JSON.parse).catch((e) => {
  if (e.code !== "ENOENT") throw e
  return { database, imports: {}, files: {}, cases: {}, committed: false }
})
assert.equal(state.database, database)
const save = async () => {
  await fs.writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2))
  await fs.rename(`${statePath}.tmp`, statePath)
}
const { storageClient } = await import("../src/services/storage/storage.client.js")
const { buildInvoiceModel, renderInvoicePdf } = await import("../src/apps/visitors/modules/accommodation/accommodation.invoice-pdf.js")
const { h4Notifications, H4_TOKEN_TYPE } = await import("../src/apps/visitors/modules/intern-accommodation/h4.notifications.js")
const { createActionLinkToken, invalidateActionLinkTokens } = await import("../src/services/action-links/action-link-token.service.js")
const { instituteDay } = await import("../src/apps/visitors/modules/intern-accommodation/h4.helpers.js")
const csv = (rows, columns) => [columns, ...rows.map((r) => columns.map((c) => r[c] ?? ""))]
  .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n") + "\n"

await mongoose.connect(cfg.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
try {
  assert.equal(mongoose.connection.name, database)
  const target = mongoose.connection.db
  const source = mongoose.connection.client.db("hms_integration_tests_h4_preview")
  state.baseDay ||= instituteDay()
  const now = new Date()
  const dayOffset = +new Date(state.baseDay) - +new Date(sourceState.baseDay)
  const periods = new Set(["fromDate", "toDate", "from", "to", "requestedFromDate", "requestedToDate", "previousFromDate", "previousToDate"])
  const shift = (value, key = "") => {
    // Test residents must not reuse a real student's unique roll number.
    if (key === "rollNumber" && typeof value === "string") return `H4TEST-${value}`
    if (value instanceof Date) {
      const moved = +value + dayOffset
      return new Date(periods.has(key) ? moved : Math.min(moved, +now))
    }
    if (!value || typeof value !== "object" || value._bsontype || Buffer.isBuffer(value)) return value
    if (Array.isArray(value)) return value.map((v) => shift(v, key))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v, k)]))
  }
  const ids = Object.values(sourceState.cases).map((c) => new mongoose.Types.ObjectId(c.id))
  const mainRequests = await source.collection("accommodationrequests").find({ _id: { $in: ids }, typeKey: "intern" }).toArray()
  assert.equal(mainRequests.length, 284, "The original manual fixture set is incomplete")
  const sourceUsers = await source.collection("users").find({}).toArray()
  assert(sourceUsers.length <= 25 && sourceUsers.every((u) => /(?:preview|video)@iiti\.ac\.in$/.test(u.email)), "Unexpected source users")
  const sourceHostels = await source.collection("hostels").find({}).toArray()
  assert.equal(sourceHostels.length, 2)
  const mainHostel = sourceHostels.find((h) => h.name === "Hall of Residence 3")
  assert(mainHostel)
  const hostelIds = sourceHostels.map((h) => h._id)
  const userIds = sourceUsers.map((u) => u._id)
  const batchIds = [...new Map(mainRequests.map((r) => [String(r.h4.batchId), r.h4.batchId])).values()]
  const rows = {
    users: sourceUsers.map(shift),
    hostels: sourceHostels.map((h) => ({ ...shift(h), name: String(h._id) === String(mainHostel._id) ? "H4 Manual Test Hostel" : "H4 Manual Scope Test Hostel" })),
    studentprofiles: (await source.collection("studentprofiles").find({ userId: { $in: userIds } }).toArray()).map(shift),
    hostelsupervisors: (await source.collection("hostelsupervisors").find({ userId: { $in: userIds } }).toArray()).map(shift),
    hostelgates: (await source.collection("hostelgates").find({ userId: { $in: userIds } }).toArray()).map(shift),
    units: (await source.collection("units").find({ hostelId: { $in: hostelIds } }).toArray()).map(shift),
    rooms: (await source.collection("rooms").find({ hostelId: { $in: hostelIds } }).toArray()).map(shift),
    roomallocations: (await source.collection("roomallocations").find({ hostelId: { $in: hostelIds } }).toArray()).map(shift),
    visitorprofiles: (await source.collection("visitorprofiles").find({ studentUserId: { $in: userIds } }).toArray()).map(shift),
    visitorrequests: (await source.collection("visitorrequests").find({ hostelId: { $in: hostelIds } }).toArray()).map(shift),
    accommodationbatches: (await source.collection("accommodationbatches").find({ _id: { $in: batchIds } }).toArray()).map(shift),
    accommodationrequests: [
      ...mainRequests,
      ...await source.collection("accommodationrequests").find({ typeKey: { $ne: "intern" }, "allotment.hostelId": { $in: hostelIds } }).toArray(),
    ].map(shift),
    accommodationreservations: (await source.collection("accommodationreservations").find({ requestId: { $in: ids } }).toArray()).map(shift),
  }
  // Keep a digest of every pre-existing record in the collections we add to.
  // Only hashes are stored; no existing users' personal data is exported.
  const digest = async (name, excludeIds) => {
    const hash = crypto.createHash("sha256")
    let count = 0
    for await (const doc of target.collection(name).find({ _id: { $nin: excludeIds } }).sort({ _id: 1 })) {
      hash.update(JSON.stringify(doc)); count++
    }
    return { count, sha256: hash.digest("hex") }
  }
  if (!state.committed) {
    for (const [name, docs] of Object.entries(rows)) {
      assert.equal(await target.collection(name).countDocuments({ _id: { $in: docs.map((d) => d._id) } }), 0, `${name}: fixture IDs already exist; nothing will be overwritten`)
      state.imports[name] = { ids: docs.map((d) => String(d._id)), before: await digest(name, docs.map((d) => d._id)) }
    }
    assert.equal(await target.collection("users").countDocuments({ email: { $in: sourceUsers.map((u) => u.email) } }), 0, "Fixture emails already exist")
    assert.equal(await target.collection("studentprofiles").countDocuments({ rollNumber: { $in: rows.studentprofiles.map((s) => s.rollNumber) } }), 0, "Fixture roll numbers already exist")
    assert.equal(await target.collection("hostels").countDocuments({ name: { $in: rows.hostels.map((h) => h.name) } }), 0, "Fixture hostel names already exist")
    await save()
    const proof = await fs.readFile(path.join(root, "artifacts/h4-manual-check/payment-proof.png"))
    const qr = await fs.readFile(path.join(root, "artifacts/h4-walkthrough/demo-qr.png"))
    const store = async (key, buffer, policy, r, filename, contentType = "image/png") => {
      if (state.files[key]) return state.files[key]
      const result = await storageClient.upload({ file: { buffer, mimetype: contentType, originalname: filename },
        policy, actorId: r.requesterUserId, actorRole: "System", sourceService: "h4-local-fixtures",
        entityHint: String(r._id), timeoutMs: 15000 })
      const ref = result.file_ref || result.fileRef
      assert(ref?.startsWith("media://"), "Storage upload did not return a file reference")
      state.files[key] = ref
      await save()
      return ref
    }
    const config = await target.collection("configurations").findOne({ key: "accommodation" })
    const hostelById = new Map(rows.hostels.map((h) => [String(h._id), h]))
    let processed = 0
    for (const r of rows.accommodationrequests.filter((r) => r.typeKey === "intern")) {
      r.h4.lastNotificationError = ""
      r.h4.proofRefs = await (async () => {
        const refs = []
        for (const ref of r.h4.proofRefs || []) refs.push(await store(ref, proof, "payment-screenshot", r, "local-test-payment-proof.png"))
        return refs
      })()
      for (const payment of [r.payment, ...r.additionalPayments]) {
        if (payment?.screenshotFileRef) payment.screenshotFileRef = await store(payment.screenshotFileRef, proof, "payment-screenshot", r, "local-test-payment-proof.png")
        if (payment?.qrRef) payment.qrRef = await store(`qr:${r._id}`, qr, "certificate", r, "local-test-payment-qr.png")
      }
      if (r.invoice?.generatedAt) {
        r.invoice.number = `TEST-H4-${state.baseDay.replaceAll("-", "")}-${r.applicantName.match(/M\d+-\d+/)[0]}`
        r.invoice.generatedAt = now
        r.invoice.emailedAt = null
        const pdf = await renderInvoicePdf(buildInvoiceModel({ request: r,
          hostelName: hostelById.get(String(r.allotment.hostelId)).name, gstin: config?.value?.gstin || "" }))
        r.invoice.pdfFileRef = await store(`invoice:${r._id}`, pdf, "certificate", r, `${r.invoice.number}.pdf`, "application/pdf")
      }
      processed++
      if (processed % 40 === 0) console.log(`Prepared ${processed}/284 requests and stored attachments`)
    }
    // All linked fixture documents become visible together. No pending mail jobs
    // are copied and no workflow mutation/notification handlers are called.
    const session = await mongoose.connection.startSession()
    try {
      await session.withTransaction(async () => {
        for (const [name, docs] of Object.entries(rows)) if (docs.length)
          await target.collection(name).insertMany(docs, { session, ordered: true })
      })
    } finally { await session.endSession() }
    state.committed = true
    state.committedAt = new Date().toISOString()
    await save()
  }
  const requests = await target.collection("accommodationrequests").find({ _id: { $in: ids } }).toArray()
  assert.equal(requests.length, 284)
  const byId = new Map(requests.map((r) => [String(r._id), r]))
  const sourceById = new Map(mainRequests.map((r) => [String(r._id), r]))
  const accounts = {}
  const pathFor = (role) => ({ Student: "student", Academics: "academics", Admin: "admin", "Hostel Supervisor": "hostel-supervisor",
    "Hostel Gate": "hostel-gate", Warden: "warden", "Associate Warden": "associate-warden", Security: "guard",
    "Maintenance Staff": "maintenance", Gymkhana: "gymkhana", Dining: "dining-office", "Super Admin": "super-admin" })[role]
  for (const [key, oldCase] of Object.entries(sourceState.cases)) {
    const r = byId.get(oldCase.id)
    const original = sourceById.get(oldCase.id)
    for (const [actor, id] of [[oldCase.creator, original.requesterUserId], [oldCase.faculty, original.h4.facultyUserId]]) {
      const user = sourceUsers.find((u) => String(u._id) === String(id))
      assert(user)
      accounts[actor] = { id: String(user._id), name: user.name, role: user.role, subRole: user.subRole || "", email: user.email,
        path: `/${user.role === "Dining" && user.subRole === "Caterer" ? "caterer" : pathFor(user.role)}/intern-accommodation` }
    }
    state.cases[key] ||= { ...oldCase, internLink: "", payerLink: "", oldPayerLink: "" }
    const entry = state.cases[key]
    if (r.allotment?.hostelId && !["Cancelled", "Rejected"].includes(r.status)) {
      entry.internLink ||= await h4Notifications.accessLink(r, "intern")
      if (key.startsWith("expired-link-")) {
        if (!entry.oldPayerLink) {
          const expired = await createActionLinkToken({ type: H4_TOKEN_TYPE, subjectModel: "AccommodationRequest",
            subjectId: r._id, recipientEmail: r.h4.payer.email, payload: { purpose: "payer" }, expiresAt: new Date(Date.now() - 86400000) })
          entry.oldPayerLink = `${cfg.FRONTEND_URL}/intern-accommodation/access/${expired.rawToken}`
        }
      } else {
        if (key.startsWith("rotated-link-") && !entry.oldPayerLink) {
          entry.oldPayerLink = await h4Notifications.accessLink(r, "payer")
          await invalidateActionLinkTokens({ type: H4_TOKEN_TYPE, subjectId: r._id, "payload.purpose": "payer" }, "Local manual test: rotated link")
        }
        entry.payerLink ||= await h4Notifications.accessLink(r, "payer")
      }
    }
  }
  state.accounts = accounts
  await save()
  const existing = {}
  for (const [name, docs] of Object.entries(rows)) {
    existing[name] = await digest(name, docs.map((d) => d._id))
    assert.deepEqual(existing[name], state.imports[name].before, `${name}: a pre-existing record changed`)
    assert.equal(await target.collection(name).countDocuments({ _id: { $in: docs.map((d) => d._id) } }), docs.length)
  }
  const records = Object.entries(state.cases).map(([key, c]) => ({ case: key, batch: c.label, student: c.name,
    category: c.category, payer: c.payerType, status: c.status, payment: c.paymentStatus,
    additionalPayment: c.additionalPaymentStatus, dateChangeStage: c.amendmentStage,
    creator: accounts[c.creator].email, faculty: accounts[c.faculty].email, candidateRoom: c.candidateRoom, unit: c.unitNumber,
    requestUrl: `${cfg.FRONTEND_URL}${accounts[c.creator].path}?request=${c.id}`,
    officeUrl: `${cfg.FRONTEND_URL}/admin/intern-accommodation?request=${c.id}`,
    internUrl: c.internLink, payerUrl: c.payerLink, invalidatedPayerUrl: c.oldPayerLink,
  })).sort((a, b) => a.batch.localeCompare(b.batch) || a.student.localeCompare(b.student))
  await fs.writeFile(path.join(output, "cases.csv"), csv(records, Object.keys(records[0])))
  const accountRows = Object.values(accounts).map((a) => ({ name: a.name, role: a.role, subRole: a.subRole, email: a.email,
    password: "H4LocalFlow2026!", url: `${cfg.FRONTEND_URL}/login?redirect=${a.path}` }))
  await fs.writeFile(path.join(output, "accounts.csv"), csv(accountRows, Object.keys(accountRows[0])))
  const summary = { database, requests: requests.length, baseDay: state.baseDay,
    imported: Object.fromEntries(Object.entries(rows).map(([name, docs]) => [name, docs.length])),
    existingRecordsUnchanged: true, frontend: cfg.FRONTEND_URL, output }
  await fs.writeFile(path.join(output, "import-summary.json"), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await mongoose.disconnect()
}
