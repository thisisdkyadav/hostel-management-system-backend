/**
 * Add manual H4 checks to the isolated local preview, using real workflow services.
 * Never drops collections, changes existing requests, or starts email workers.
 * Run with the preview environment; H4_MANUAL_OUTPUT may override the artifact path.
 * Completed cases are left alone on rerun, including after manual changes.
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"
import mongoose from "mongoose"

const uri = new URL(process.env.MONGO_URI || "mongodb://invalid/invalid")
assert(["127.0.0.1", "localhost"].includes(uri.hostname), "Only local MongoDB is allowed")
assert.equal(uri.pathname, "/hms_integration_tests_h4_preview", "Only the isolated H4 preview database is allowed")
assert.notEqual(process.env.NODE_ENV, "production")
// Set before service imports: dotenv must not pick up the project's SMTP credentials.
process.env.SMTP_USER = ""
process.env.SMTP_PASS = ""
process.env.SMTP_ACCOUNTS = "[]"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const output = path.resolve(process.env.H4_MANUAL_OUTPUT || path.join(root, "artifacts/h4-manual-check"))
await fs.mkdir(output, { recursive: true })
const statePath = path.join(output, "seed-state.json")
const state = await fs.readFile(statePath, "utf8").then(JSON.parse).catch((e) => {
  if (e.code !== "ENOENT") throw e
  return { version: 1, cases: {}, baseDay: null, fixtures: {} }
})
const save = async () => {
  await fs.writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2))
  await fs.rename(`${statePath}.tmp`, statePath)
}
const {
  User, StudentProfile, Hostel, Room, AccommodationRequest,
  AccommodationBatch, VisitorProfile, VisitorRequest, ActionLinkToken,
} = await import("../src/models/index.js")
const { h4Service } = await import("../src/apps/visitors/modules/intern-accommodation/h4.service.js")
const { h4Payments } = await import("../src/apps/visitors/modules/intern-accommodation/h4.payments.js")
const { h4Rooms } = await import("../src/apps/visitors/modules/intern-accommodation/h4.rooms.js")
const { h4Access } = await import("../src/apps/visitors/modules/intern-accommodation/h4.access.js")
const { h4Notifications, H4_TOKEN_TYPE } = await import("../src/apps/visitors/modules/intern-accommodation/h4.notifications.js")
const { S, instituteDay } = await import("../src/apps/visitors/modules/intern-accommodation/h4.helpers.js")
const { closeDataCacheClient } = await import("../src/services/cache/redisDataCache.client.js")

const check = (result, context) => {
  assert.equal(result?.success, true, `${context}: ${result?.message || "operation failed"}`)
  return result.data
}
const csv = (rows, fields) => [fields, ...rows.map((row) => fields.map((field) => row[field] ?? ""))]
  .map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n") + "\n"
const plans = []
const group = (key, label, target, options = {}) => {
  const number = plans.length + 1
  // Every case has all four category/payer combinations, split across two faculty.
  const cases = Array.from({ length: 4 }, (_, i) => ({
    key: `${key}-${i + 1}`, number, index: i,
    label: `Manual ${String(number).padStart(2, "0")} - ${label}`,
    target, ...options, ...(typeof options.variant === "function" ? options.variant(i) : {}),
  }))
  plans.push(cases)
}

for (const [key, label, target] of [
  ["draft", "Drafts", "draft"],
  ["faculty", "Faculty recommendation", "faculty"],
  ["returned", "Returned for correction", "returned"],
  ["office", "CW Office capacity review", "office"],
  ["chief", "Chief Warden approval", "chief"],
  ["approved", "Approved - issue charges", "approved"],
  ["payment-pending", "Payment requested", "offered"],
  ["payment-deferred", "Payment deferred", "deferred"],
  ["payment-submitted", "Payment proof submitted", "submitted"],
  ["payment-rejected", "Payment proof rejected", "payment-rejected"],
  ["payment-verified", "Payment verified - assign room", "verified"],
  ["room-assigned", "Room assigned - check in", "assigned"],
  ["checked-in", "Checked in", "checked-in"],
  ["checked-out", "Checked out - additional bill unpaid", "checked-out"],
  ["invoiced", "Accommodation invoice generated", "invoiced"],
  ["rejected", "Request rejected at each approval desk", "rejected"],
  ["cancelled", "Cancelled before payment and after allocation", "cancelled"],
]) group(key, label, target)

for (const type of ["extend", "postpone"])
  for (const stage of ["faculty", "office", "chief"])
    group(`${type}-${stage}`, `${type === "extend" ? "Extension" : "Postponement"} - ${stage} review`, "date-change", { type, stage })
for (const payment of ["Pending", "Deferred", "Submitted", "Rejected", "Verified"])
  group(`extra-${payment.toLowerCase()}`, `Approved extension - additional payment ${payment.toLowerCase()}`, "extra", { extraStatus: payment })
group("postponement-approved", "Approved postponement - room dates updated", "postponement-approved")
for (const stage of ["faculty", "office", "chief"])
  group(`change-rejected-${stage}`, `Date change rejected by ${stage} - original stay retained`, "change-rejected", { stage })
group("change-returned", "Date change returned - original reservation retained", "change-returned")

for (const [key, label, candidate, warningKinds] of [
  ["clean", "Empty room without warnings", "M-CLEAN", []],
  ["resident", "Resident student and overlapping normal guest", "401", ["resident", "guest", "capacity"]],
  ["guest", "Overlapping H2 guest booking", "M-GUEST", ["guest", "capacity"]],
  ["legacy", "Overlapping legacy visitor booking", "M-LEGACY", ["legacy-guest", "capacity"]],
  ["intern-holder", "Existing H4 room reservations", "M-INTERN", null],
  ["intern-overlap", "Overlapping H4 stays", "M-INTERN", ["intern", "capacity"]],
  ["capacity", "Resident occupancy and capacity warnings", "M-CAPACITY", ["resident", "capacity"]],
  ["inactive", "Inactive room warning", "M-INACTIVE", ["condition"]],
  ["storage", "Storage room warning", "M-STORAGE", ["condition"]],
  ["maintenance", "Maintenance room warning", "M-MAINT", ["condition"]],
  ["duplicate", "Same room number in different units", "501", []],
]) group(`room-${key}`, label, key === "intern-holder" ? "assigned" : "room-preview", {
  candidate, warningKinds, variant: (i) => key === "duplicate" ? { unitNumber: i ? "B" : "A" } : {},
})

for (const [key, label, target] of [
  ["waiver", "Zero accommodation charge - waiver recorded", "waiver"],
  ["manual-paid", "Accounts marked payment received", "manual-paid"],
  ["manual-unpaid", "Accounts marked payment unpaid again", "manual-unpaid"],
  ["manual-correction", "Accounts corrected payment reference", "manual-correction"],
  ["room-moved", "Room changed after check-in - allocation history", "room-moved"],
  ["checkin-blocked", "Room retained - additional payment blocks check-in", "checkin-blocked"],
  ["cancel-change", "Cancelled with pending extension - reservation released", "cancel-change"],
  ["returned-resubmitted", "Returned and resubmitted - faculty reviews again", "returned-resubmitted"],
  ["expired-link", "Expired external payer link", "expired-link"],
  ["rotated-link", "Rotated external links - old link invalid", "rotated-link"],
]) group(key, label, target)
group("other-hostel", "Different hostel - supervisor and gate access restricted", "other-hostel")

const accountsFile = process.env.H4_MANUAL_ACCOUNTS || "/tmp/h4-record-accounts.json"
const loginData = JSON.parse(await fs.readFile(accountsFile, "utf8"))
for (const actor of Object.keys(loginData.accounts).filter((key) => key !== "creator"))
  group(`creator-${actor}`, `Created by ${loginData.accounts[actor].name}`, "role-owned", { creator: actor })

let created = 0
try {
  await mongoose.connect(process.env.MONGO_URI)
  assert.equal(mongoose.connection.name, "hms_integration_tests_h4_preview")
  state.baseDay ||= instituteDay()
  const day = (offset = 0) => new Date(+new Date(state.baseDay) + offset * 86400000).toISOString().slice(0, 10)
  const actors = {}
  for (const [key, account] of Object.entries(loginData.accounts)) {
    actors[key] = await User.findOne({ _id: account.id, email: account.email }).lean()
    assert(actors[key], `Missing preview account: ${key}`)
  }
  const hostel = await Hostel.findOne({ name: "Hall of Residence 3" }).lean()
  assert(hostel && !hostel.isArchived, "Start the local H4 preview fixtures first")
  const otherHostel = await Hostel.findOneAndUpdate({ name: "Manual Check Other Hostel" }, {
    $setOnInsert: { name: "Manual Check Other Hostel", type: "room-only", gender: "Co-ed" },
  }, { upsert: true, returnDocument: "after", runValidators: true })
  // Complete the local requester's profile so normal Student login can load its home page.
  await StudentProfile.updateOne({ userId: actors.creator._id }, { $setOnInsert: {
    userId: actors.creator._id, rollNumber: "MANUAL2026001", gender: "Male", degree: "B.Tech",
    department: "Computer Science and Engineering", batch: "2026", isDayScholar: true,
    facultyAdvisorEmail: actors.faculty.email, status: "Active",
  } }, { upsert: true, runValidators: true })
  const room = async (number, options = {}, h = hostel) => Room.findOneAndUpdate({ hostelId: h._id, roomNumber: number, unitId: null }, {
    $setOnInsert: { hostelId: h._id, roomNumber: number, capacity: 2, occupancy: 0, status: "Active", ...options },
  }, { upsert: true, returnDocument: "after", runValidators: true })
  for (const [number, options] of [
    ["M-CLEAN", {}], ["M-GUEST", { capacity: 1 }], ["M-LEGACY", { capacity: 1 }],
    ["M-INTERN", { capacity: 1 }], ["M-CAPACITY", { capacity: 2, occupancy: 2 }],
    ["M-INACTIVE", { status: "Inactive", capacity: 0, originalCapacity: 2 }],
    ["M-STORAGE", { status: "Storage", capacity: 0, originalCapacity: 2 }],
    ["M-MAINT", { status: "Maintenance", capacity: 0, originalCapacity: 2 }],
  ]) await room(number, options)
  const guestRoom = await room("M-GUEST")
  if (!state.fixtures.guestId) {
    const existing = await AccommodationRequest.findOne({ typeKey: "visitor", applicantEmail: "manual-h2@example.com" })
    const guest = existing || await AccommodationRequest.create({
      typeKey: "visitor", requesterUserId: actors.creator._id, applicantName: "Manual H2 requester",
      applicantEmail: "manual-h2@example.com", guests: [{ name: "Manual normal guest", gender: "Male" }],
      persons: 1, status: S.ROOMS_ASSIGNED, stay: { fromDate: day(), toDate: day(20) },
      allotment: { hostelId: hostel._id }, guestAllotments: [{ guestIndex: 0, hostelId: hostel._id }],
      rooms: [{ roomId: guestRoom._id, guestIndexes: [0] }],
    })
    state.fixtures.guestId = String(guest._id)
  }
  if (!state.fixtures.legacyId) {
    const legacyRoom = await room("M-LEGACY")
    let visitor = await VisitorProfile.findOne({ email: "manual-legacy@example.com" })
    visitor ||= await VisitorProfile.create({ studentUserId: actors.creator._id, name: "Manual legacy guest",
      email: "manual-legacy@example.com", phone: "9876543210", relation: "Father" })
    const existing = await VisitorRequest.findOne({ visitors: visitor._id, reason: "Manual H4 conflict check" })
    const request = existing || await VisitorRequest.create({ userId: actors.creator._id,
      visitors: [visitor._id], reason: "Manual H4 conflict check", hostelId: hostel._id,
      allocatedRooms: [legacyRoom._id], fromDate: day(), toDate: day(20), status: "Approved" })
    state.fixtures.legacyId = String(request._id)
  }
  const proof = await fs.readFile(process.env.H4_MANUAL_PROOF || path.join(root, "artifacts/h4-walkthrough/demo-proof.png"))
  await fs.writeFile(path.join(output, "payment-proof.png"), proof)
  await save()

  const names = ["Aarav Mehta", "Diya Nair", "Kabir Shah", "Mira Rao"]
  const student = (c) => ({
    name: `${names[c.index % 4]} M${String(c.number).padStart(2, "0")}-${c.index + 1}`,
    gender: c.index % 2 ? "Female" : "Male", category: c.index < 2 ? "intern" : "unregistered-student",
    email: `h4-manual-${c.key}@example.com`.toLowerCase(), mobile: `98765${String(c.number * 10 + c.index).padStart(5, "0")}`,
    institute: c.index < 2 ? "NIT Bhopal" : "DAVV Indore", instituteAddress: "University Campus, Madhya Pradesh, India",
    course: c.index < 2 ? "B.Tech" : "M.Sc", department: c.index % 2 ? "Physics" : "Computer Science",
    payerType: c.index % 2 ? "faculty" : "intern",
    stay: { fromDate: day(), toDate: day(14), purpose: `Local manual check: ${c.label}`,
      checkInTime: c.index === 3 ? "14:00" : "11:00", checkOutTime: c.index === 2 ? "16:00" : "11:00" },
  })
  const read = (c) => AccommodationRequest.findById(state.cases[c.key].id).lean()
  const step = async (c, name, run) => {
    const entry = state.cases[c.key]
    if (entry.steps.includes(name)) return
    const r = await read(c)
    check(await run(r, { revision: r.h4.revision }), `${c.key} / ${name}`)
    entry.steps.push(name)
    await save()
  }
  const decision = (c, stage, action = "approve", extra = {}, name = stage) => step(c, name, (r, revision) =>
    h4Service.decision(String(r._id), { ...revision, action, confirmPayer: true, confirmAvailability: true,
      reason: action === "approve" ? "Manual check: reviewed and confirmed" : "Manual check: revise institute details or research dates",
      ...extra }, actors[stage === "faculty" ? c.faculty : stage], stage))
  const levels = ["faculty", "office", "chief", "approved", "offered", "submitted", "verified", "assigned", "checked-in", "invoiced"]
  const base = async (c, target) => {
    const level = levels.indexOf(target)
    assert(level >= 0, `Unknown base target ${target}`)
    if (level >= 1) await decision(c, "faculty")
    if (level >= 2) await decision(c, "office")
    if (level >= 3) await decision(c, "chief")
    if (level >= 4) await step(c, "offer", (r, revision) => h4Payments.offer(String(r._id), { ...revision,
      hostelId: String(c.target === "other-hostel" ? otherHostel._id : hostel._id),
      mess: c.index % 2 ? "without" : "with", price: c.target === "waiver" ? 0 : 2400 + c.index * 300,
      gstPercentage: c.index % 2 ? 0 : 18, reason: "Department-sponsored accommodation waiver",
      remarks: "Local test accommodation bill. Mess is billed separately." }, actors.office))
    if (level >= 5) await submit(c)
    if (level >= 6) await step(c, "verify-main", (r, revision) => h4Payments.verify(String(r._id),
      { ...revision, action: "verify" }, actors.accounts))
    if (level >= 7) await assign(c)
    if (level >= 8) await step(c, "check-in", (r, revision) => h4Service.arrival(String(r._id), revision, actors.gate))
    if (level >= 9) await step(c, "check-out", (r, revision) => h4Service.arrival(String(r._id), revision, actors.gate, true))
  }
  const payActor = async (c, r) => {
    if (c.publicPayer) return { external: "payer", email: r.h4.payer.email }
    return actors[c.index % 2 ? c.faculty : c.creator || "creator"]
  }
  const submit = async (c, additional = false) => {
    const prefix = additional ? "extra" : "main"
    await step(c, `upload-${prefix}`, async (r, revision) => {
      const result = await h4Access.upload(String(r._id), {
        buffer: proof, size: proof.length, mimetype: "image/png", originalname: "local-payment-proof.png",
      }, await payActor(c, r), revision.revision)
      if (result.success) state.cases[c.key][`${prefix}Proof`] = result.data.fileRef
      return result
    })
    await step(c, `submit-${prefix}`, async (r, revision) => h4Payments.submit(String(r._id), {
      ...revision, utr: String(202600000000 + c.number * 100 + c.index + (additional ? 50 : 0)),
      paidAt: state.baseDay, screenshotFileRef: state.cases[c.key][`${prefix}Proof`],
      ...(additional ? { additionalPaymentId: String(r.additionalPayments.at(-1)._id) } : {}),
    }, await payActor(c, r)))
  }
  const assign = async (c, moved = false) => step(c, moved ? "move-room" : "assign-room", async (r, revision) => {
    const number = moved ? `M-${c.number}-${c.index + 1}-NEW` : c.candidate || `M-${c.number}-${c.index + 1}`
    if (!c.candidate || moved) await room(number)
    const preview = check(await h4Rooms.preview(String(r._id), { roomNumber: number, unitNumber: c.unitNumber }, actors.supervisor), `${c.key} room preview`)
    return h4Rooms.assign(String(r._id), { ...revision, roomNumber: number, unitNumber: c.unitNumber,
      fingerprint: preview.fingerprint, acknowledged: true,
      overrideReason: "Manual local fixture: supervisor checked physical availability and accepted the recorded warning" }, actors.supervisor)
  })
  const change = (c, type = "extend") => step(c, "schedule-change", (r, revision) => h4Service.schedule(String(r._id), {
    ...revision, type, fromDate: type === "extend" ? r.stay.fromDate.toISOString().slice(0, 10) : day(3),
    toDate: type === "extend" ? day(21) : day(17), reason: "Manual check: internship schedule changed",
  }, actors[c.creator || "creator"]))
  const changeTo = async (c, stage, amount = 600) => {
    if (["office", "chief", "approved"].includes(stage)) await decision(c, "faculty", "approve", {}, "change-faculty")
    if (["chief", "approved"].includes(stage)) await decision(c, "office", "approve", { extraAmount: amount }, "change-office")
    if (stage === "approved") await step(c, "change-chief", async (r, revision) => {
      const extra = {}
      if (r.rooms.length) {
        const assigned = await Room.findById(r.rooms[0].roomId).populate("unitId").lean()
        const preview = check(await h4Rooms.preview(String(r._id), { roomNumber: assigned.roomNumber,
          unitNumber: assigned.unitId?.unitNumber, amendment: true }, actors.chief), `${c.key} changed dates preview`)
        Object.assign(extra, { fingerprint: preview.fingerprint, acknowledged: true,
          overrideReason: "Manual check: confirmed room remains usable for revised dates" })
      }
      return h4Service.decision(String(r._id), { ...revision, action: "approve", ...extra }, actors.chief, "chief")
    })
  }
  const cancel = (c, creator = false) => step(c, "cancel", (r, revision) => h4Service.cancel(String(r._id), {
    ...revision, reason: "Manual check: internship cancelled", refundNote: "Payment history retained; accounts will review any refund separately",
  }, actors[creator ? c.creator || "creator" : "office"]))
  const recordLinks = async (c) => {
    const r = await read(c)
    const entry = state.cases[c.key]
    if (r.allotment?.hostelId && ![S.CANCELLED, S.REJECTED].includes(r.status)) {
      entry.internLink ||= await h4Notifications.accessLink(r, "intern")
      entry.payerLink ||= await h4Notifications.accessLink(r, "payer")
      await save()
    }
  }
  const settle = (c, action) => step(c, `accounts-${action}`, (r, revision) => h4Payments.settle(String(r._id), {
    ...revision, action, reference: `MANUAL-RECEIPT-${c.number}-${c.index + 1}`, paidAt: state.baseDay,
    reason: `Manual check: accounts ${action} after reconciliation`,
  }, actors.accounts))

  for (const cases of plans) {
    // Two students per faculty batch gives both faculty accounts actionable queues.
    for (let offset = 0; offset < cases.length; offset += 2) {
      const slice = cases.slice(offset, offset + 2)
      for (const c of slice) c.faculty = c.creator === "otherFaculty" ? "otherFaculty" : c.creator === "faculty" ? "faculty" : offset ? "otherFaculty" : "faculty"
      const creatorKey = slice[0].creator || "creator"
      const batchLabel = `${slice[0].label}${cases.length > 2 ? offset ? " - B" : " - A" : ""}`
      const missing = slice.filter((c) => !state.cases[c.key])
      if (missing.length) {
        const existingBatch = await AccommodationBatch.findOne({ label: batchLabel, creatorUserId: actors[creatorKey]._id })
        let items
        if (existingBatch) items = await AccommodationRequest.find({ "h4.batchId": existingBatch._id }).lean()
        else {
          items = check(await h4Service.createBatch({ label: batchLabel, facultyUserId: String(actors[slice[0].faculty]._id),
            draft: slice[0].target === "draft", recommend: slice[0].target === "role-owned" && actors[creatorKey].role === "Academics",
            students: slice.map(student) }, actors[creatorKey]), batchLabel).items
          created += items.length
        }
        for (const c of missing) {
          const item = items.find((r) => r.applicantEmail === student(c).email)
          assert(item, `${c.key}: existing batch is incomplete`)
          state.cases[c.key] = { id: String(item._id), label: batchLabel, steps: [], complete: false, creator: creatorKey, faculty: c.faculty }
          if (slice[0].target === "role-owned" && actors[creatorKey].role === "Academics") state.cases[c.key].steps.push("faculty")
        }
        await save()
      }
      for (const c of slice) {
        const entry = state.cases[c.key]
        if (entry.complete) continue
        c.publicPayer = c.target === "submitted" && c.index === 0
        switch (c.target) {
          case "draft": break
          case "faculty": case "office": case "chief": case "approved": case "offered":
          case "submitted": case "verified": case "assigned": case "checked-in": case "invoiced":
            await base(c, c.target); break
          case "returned": case "rejected": {
            const stage = ["faculty", "office", "chief", "faculty"][c.index]
            await base(c, stage)
            await decision(c, stage, c.target === "returned" ? "request_modification" : "reject", {}, "final-decision")
            break
          }
          case "deferred":
            await base(c, "offered")
            await step(c, "defer", async (r, revision) => h4Payments.defer(String(r._id), revision, await payActor(c, r)))
            break
          case "payment-rejected":
            await base(c, "submitted")
            await step(c, "reject-proof", (r, revision) => h4Payments.verify(String(r._id), { ...revision,
              action: "reject", reason: "Manual check: UTR does not match bank receipt; upload corrected proof" }, actors.accounts))
            break
          case "cancelled":
            await base(c, ["faculty", "offered", "verified", "assigned"][c.index])
            await recordLinks(c)
            await cancel(c, c.index === 0)
            break
          case "checked-out": case "extra": case "checkin-blocked":
            await base(c, c.target === "checkin-blocked" ? "assigned" : "checked-in")
            await change(c)
            await changeTo(c, "approved", 600 + c.index * 100)
            if (c.extraStatus === "Deferred") await step(c, "defer-extra", async (r, revision) => h4Payments.defer(String(r._id),
              { ...revision, additionalPaymentId: String(r.additionalPayments.at(-1)._id) }, await payActor(c, r)))
            if (["Submitted", "Rejected", "Verified"].includes(c.extraStatus)) await submit(c, true)
            if (["Rejected", "Verified"].includes(c.extraStatus)) await step(c, "decide-extra", (r, revision) => h4Payments.verify(String(r._id), {
              ...revision, additionalPaymentId: String(r.additionalPayments.at(-1)._id),
              action: c.extraStatus === "Verified" ? "verify" : "reject", reason: "Manual check: additional receipt reviewed",
            }, actors.accounts))
            if (c.target === "checked-out") await step(c, "check-out", (r, revision) => h4Service.arrival(String(r._id), revision, actors.gate, true))
            break
          case "date-change":
            await base(c, c.type === "postpone" ? "assigned" : "checked-in")
            await change(c, c.type)
            await changeTo(c, c.stage)
            break
          case "postponement-approved":
            await base(c, "assigned")
            await change(c, "postpone")
            await changeTo(c, "approved", 0)
            break
          case "change-rejected": case "change-returned":
            await base(c, "assigned")
            await change(c)
            await changeTo(c, c.stage || "faculty")
            await decision(c, c.stage || "faculty", c.target === "change-rejected" ? "reject" : "request_modification", {}, "change-declined")
            break
          case "room-preview": await base(c, "verified"); break
          case "waiver": await base(c, "offered"); break
          case "manual-paid": await base(c, "offered"); await settle(c, "mark_paid"); break
          case "manual-unpaid": await base(c, "verified"); await settle(c, "mark_unpaid"); break
          case "manual-correction": await base(c, "verified"); await settle(c, "correct"); break
          case "room-moved": await base(c, "checked-in"); await assign(c, true); break
          case "cancel-change":
            await base(c, "assigned"); await recordLinks(c); await change(c); await cancel(c); break
          case "returned-resubmitted":
            await base(c, "faculty")
            await decision(c, "faculty", "request_modification", {}, "return-for-edits")
            await step(c, "resubmit", (r, revision) => h4Service.edit(String(r._id), { ...revision,
              student: { ...student(c), instituteAddress: "Corrected campus address, Indore, Madhya Pradesh" },
              facultyUserId: String(actors[c.faculty]._id) }, actors.creator))
            break
          case "expired-link": case "rotated-link":
            await base(c, "offered"); await recordLinks(c)
            if (!entry.oldPayerLink) { entry.oldPayerLink = entry.payerLink; await save() }
            if (!entry.steps.includes("invalidate-link")) {
              if (c.target === "expired-link") await ActionLinkToken.updateMany({ type: H4_TOKEN_TYPE,
                subjectId: entry.id, "payload.purpose": "payer" }, { $set: { expiresAt: new Date(Date.now() - 86400000) } })
              else await h4Notifications.invalidateAccess(entry.id)
              entry.steps.push("invalidate-link")
              if (c.target === "rotated-link") {
                entry.internLink = await h4Notifications.accessLink(await read(c), "intern")
                entry.payerLink = await h4Notifications.accessLink(await read(c), "payer")
              } else entry.payerLink = ""
              await save()
            }
            break
          case "other-hostel": await base(c, "verified"); break
          case "role-owned": await base(c, c.index === 0 ? "office" : "verified"); break
          default: throw new Error(`Unknown target ${c.target}`)
        }
        if (c.target !== "expired-link") await recordLinks(c)
        const r = await read(c)
        if (c.target === "room-preview") {
          const preview = check(await h4Rooms.preview(entry.id, { roomNumber: c.candidate, unitNumber: c.unitNumber }, actors.supervisor), c.key)
          const kinds = [...new Set(preview.warnings.map((w) => w.kind))].sort()
          for (const expected of c.warningKinds) assert(kinds.includes(expected), `${c.key}: missing ${expected} warning`)
          if (!c.warningKinds.length) assert.equal(kinds.length, 0, `${c.key}: expected a clean room`)
          entry.warningKinds = kinds.join("; ")
        }
        entry.status = r.status
        entry.paymentStatus = r.payment?.status || ""
        entry.additionalPaymentStatus = r.additionalPayments.at(-1)?.status || ""
        entry.amendmentStage = r.h4.amendment?.stage || ""
        entry.category = r.h4.category
        entry.payerType = r.h4.payer.type
        entry.name = r.applicantName
        entry.candidateRoom = c.candidate || (r.rooms.length ? (await Room.findById(r.rooms[0].roomId).lean()).roomNumber : "")
        entry.unitNumber = c.unitNumber || ""
        entry.complete = true
        entry.seededAt = new Date().toISOString()
        await save()
      }
    }
    console.log(`Seeded ${cases[0].label} (${cases.length} entries)`)
  }

  // A booking starting exactly when the original stay ends creates a warning
  // only for the proposed extension. The current reservation remains valid.
  for (const key of ["extend-chief-1", "extend-chief-3"]) {
    const entry = state.cases[key]
    const r = await AccommodationRequest.findById(entry.id).lean()
    const assignedRoom = await Room.findById(r.rooms[0].roomId).lean()
    const email = `h4-manual-future-guest-${key}@example.com`
    if (!await AccommodationRequest.exists({ applicantEmail: email, typeKey: "visitor" }))
      await AccommodationRequest.create({ typeKey: "visitor", requesterUserId: actors.creator._id,
        applicantName: "Manual future H2 requester", applicantEmail: email,
        guests: [{ name: "Manual next guest", gender: "Male" }], persons: 1, status: S.ROOMS_ASSIGNED,
        stay: { fromDate: day(14), toDate: day(24), checkInTime: r.stay.checkOutTime || "11:00", checkOutTime: "11:00" },
        allotment: { hostelId: hostel._id }, guestAllotments: [{ guestIndex: 0, hostelId: hostel._id }],
        rooms: [{ roomId: assignedRoom._id, guestIndexes: [0] }],
      })
    entry.warningKinds = "guest (proposed extension only)"
  }
  await save()
  const records = Object.entries(state.cases).map(([key, c]) => ({
    case: key, batch: c.label, student: c.name, category: c.category, payer: c.payerType,
    status: c.status, payment: c.paymentStatus, additionalPayment: c.additionalPaymentStatus,
    dateChangeStage: c.amendmentStage, creator: loginData.accounts[c.creator].email,
    faculty: loginData.accounts[c.faculty].email, candidateRoom: c.candidateRoom, unit: c.unitNumber,
    expectedRoomWarnings: c.warningKinds || "", requestId: c.id,
    requesterUrl: `${process.env.FRONTEND_URL}${loginData.accounts[c.creator].path}?request=${c.id}`,
    officeUrl: `${process.env.FRONTEND_URL}/admin/intern-accommodation?request=${c.id}`,
    internUrl: c.internLink || "", payerUrl: c.payerLink || "", invalidatedPayerUrl: c.oldPayerLink || "",
  }))
  await fs.writeFile(path.join(output, "cases.csv"), csv(records, Object.keys(records[0])))
  const accountRows = Object.values(loginData.accounts).map((account) => ({
    name: account.name, role: account.role, subRole: account.subRole || "", email: account.email,
    password: loginData.password, url: `${process.env.FRONTEND_URL}/login?redirect=${account.path}`,
  }))
  await fs.writeFile(path.join(output, "accounts.csv"), csv(accountRows, Object.keys(accountRows[0])))
  const counts = records.reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc }, {})
  console.log(JSON.stringify({ created, totalManualEntries: records.length, stages: counts, output }, null, 2))
} finally {
  await closeDataCacheClient()
  await mongoose.disconnect()
}
