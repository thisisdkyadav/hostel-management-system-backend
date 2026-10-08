import {
  success,
  created,
  badRequest,
  forbidden,
  notFound,
  conflict,
  withTransaction,
} from "../../../../services/base/index.js"
import { accommodationQueries as queries } from "../../../../services/accommodation/accommodationQueries.service.js"
import { accommodationOwner as owner } from "../../../../services/accommodation/accommodationOwner.service.js"
import { userQueries } from "../../../../services/user/userQueries.service.js"
import { hostelQueries } from "../../../../services/hostel/hostelQueries.service.js"
import { computeNights, emptyQuote, getAccommodationConfig } from "../accommodation/accommodation.quote.js"
import { resolveStayTimes } from "../accommodation/accommodation.stay.js"
import { accommodationService } from "../accommodation/accommodation.service.js"
import { buildInvoiceModel, renderInvoicePdf } from "../accommodation/accommodation.invoice-pdf.js"
import { buildInvoiceExportExcel, invoiceExportRows } from "../accommodation/accommodation.invoice-export.js"
import { fileAccessService } from "../../../../services/storage/file-access.service.js"
import { withLock } from "../../../../services/lock/distributedLock.js"
import { inspectRoom, acknowledgePreview, persistReservation, reservationPeriod } from "./h4.rooms.js"
import { h4Notifications } from "./h4.notifications.js"
import { getHostelGuestAvailability } from "../accommodation/accommodation.availability.js"
import {
  S,
  validId,
  institutional,
  clean,
  emailValid,
  isCreator,
  isFaculty,
  isOffice,
  isChief,
  isAccounts,
  isDesk,
  isClosed,
  paid,
  audit,
  approve,
  hostelScope,
  canRead,
  scopeFilter,
  freshUser,
  mutate,
  instituteDay,
} from "./h4.helpers.js"

const PRE_REVIEW = [S.DRAFT, S.RETURNED_TO_STUDENT]
const BEFORE_PAYMENT = [
  S.DRAFT,
  S.RETURNED_TO_STUDENT,
  S.PENDING_FA_RECOMMENDATION,
  S.PENDING_CWO_CAPACITY,
  S.PENDING_CW_APPROVAL,
  S.CW_APPROVED,
]
const day = (v) => String(v || "").slice(0, 10)
const stayInput = (input = {}) => {
  const fromDate = new Date(input.fromDate),
    toDate = new Date(input.toDate)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day(input.fromDate)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day(input.toDate)) ||
    !Number.isFinite(+fromDate) ||
    !Number.isFinite(+toDate) ||
    toDate <= fromDate
  )
    return { error: "Enter a valid start and end date" }
  if (
    fromDate.toISOString().slice(0, 10) !== day(input.fromDate) ||
    toDate.toISOString().slice(0, 10) !== day(input.toDate)
  )
    return { error: "Enter valid calendar dates" }
  if ((toDate - fromDate) / 86400000 > 366) return { error: "A stay can be at most 366 days" }
  const times = resolveStayTimes(input)
  if (times.error) return times
  return { fromDate, toDate, ...times, purpose: clean(input.purpose, 1000) }
}
const validateStudent = (s, draft = false) => {
  if (!s || typeof s !== "object" || Array.isArray(s)) return "Student details are required"
  if (draft) {
    if (s.gender && !["Male", "Female", "Other"].includes(s.gender)) return "Select gender"
    if (s.category && !["intern", "unregistered-student"].includes(s.category)) return "Select student category"
    if (s.payerType && !["intern", "faculty"].includes(s.payerType)) return "Select who pays"
    const times = resolveStayTimes(s.stay || {})
    if (times.error) return times.error
    for (const k of ["fromDate", "toDate"])
      if (s.stay?.[k] && !Number.isFinite(+new Date(s.stay[k]))) return "Enter a valid date"
    return null
  }
  if (!clean(s?.name, 120)) return "Enter the student name"
  if (!["Male", "Female", "Other"].includes(s.gender)) return "Select gender"
  if (!["intern", "unregistered-student"].includes(s.category || "intern")) return "Select student category"
  if (!["intern", "faculty"].includes(s.payerType)) return "Select who pays"
  if (!draft && (!emailValid(s.email) || !/^[+\d()\s-]{7,20}$/.test(String(s.mobile || ""))))
    return "Enter a valid student email and mobile number"
  if (!draft && ["institute", "instituteAddress", "course", "department"].some((k) => !clean(s[k])))
    return "Complete institute, address, course and department"
  const stay = stayInput(s.stay)
  if (stay.error) return stay.error
  if (!draft && !stay.purpose) return "Enter the reason for stay"
  if (!draft && stay.fromDate < new Date(instituteDay())) return "Start date cannot be in the past"
  return null
}
const facultyFor = async (id) => {
  if (!validId(id)) return null
  const u = await userQueries.findUserById(id, { select: "name email role", lean: true })
  return u?.role === "Academics" && institutional(u.email) ? u : null
}
const applyStudent = (r, s, faculty, draft = false) => {
  r.applicantName = clean(s.name, 120)
  r.applicantEmail = clean(s.email, 254).toLowerCase()
  r.applicantPhone = clean(s.mobile, 20)
  r.guests = r.applicantName && s.gender ? [{ name: r.applicantName, gender: s.gender }] : []
  r.stay = draft
    ? {
        fromDate: s.stay?.fromDate || undefined,
        toDate: s.stay?.toDate || undefined,
        ...resolveStayTimes(s.stay || {}),
        purpose: clean(s.stay?.purpose, 1000),
      }
    : stayInput(s.stay)
  r.persons = 1
  r.nights = computeNights(r.stay.fromDate, r.stay.toDate)
  r.h4.category = s.category || "intern"
  r.h4.gender = s.gender || ""
  for (const k of ["institute", "instituteAddress", "course", "department"])
    r.h4[k] = clean(s[k], k === "instituteAddress" ? 1000 : 200)
  r.h4.facultyUserId = faculty._id
  r.h4.facultyName = faculty.name
  r.h4.facultyEmail = faculty.email
  r.facultyAdvisorEmail = faculty.email
  r.h4.payer = {
    type: s.payerType || "intern",
    name: s.payerType === "faculty" ? faculty.name : r.applicantName,
    email: s.payerType === "faculty" ? faculty.email : r.applicantEmail,
    verifiedBy: null,
    verifiedAt: null,
  }
}
const routeSubmission = (r, u, selfRecommend) => {
  r.currentStage = "faculty"
  audit(r, u, "Submitted for faculty recommendation", S.PENDING_FA_RECOMMENDATION)
  if (selfRecommend) {
    r.h4.payer.verifiedBy = u._id
    r.h4.payer.verifiedAt = new Date()
    approve(r, u, "faculty", "recommend", "Payer confirmed on submission")
    r.currentStage = "office"
    audit(r, u, "Submitted and recommended; payer confirmed", S.PENDING_CWO_CAPACITY)
  }
}
const approvalStage = (r) => r.h4.amendment?.stage || r.currentStage
const changeRow = (r) => r.scheduleChanges.id(r.h4.amendment?.changeId)
const notifyResult = async (result) => {
  if (result.success) await h4Notifications.handoff(result.data)
  return result
}

export const h4Service = {
  async availability(id, user) {
    if (!validId(id)) return badRequest("Invalid request ID")
    const u = await freshUser(user)
    if (!isOffice(u)) return forbidden()
    const r = await queries.findH4ById(id, { lean: true })
    if (!r) return notFound("H4 request")
    if (!(await canRead(r, u))) return forbidden()
    if (!r.stay.fromDate || !r.stay.toDate) return badRequest("Complete the stay dates before checking availability")
    const amendment = r.scheduleChanges.find(
      (c) => String(c._id) === String(r.h4.amendment?.changeId) && c.status === "pending",
    )
    const from = amendment?.requestedFromDate || r.stay.fromDate,
      to = amendment?.requestedToDate || r.stay.toDate
    const hostels = []
    for (const h of await hostelQueries.findNonArchivedHostelsSorted()) {
      const stats = await hostelQueries.getRoomStatsForHostel(h._id)
      const guest = await getHostelGuestAvailability({
        hostelId: h._id,
        from,
        to,
        checkInTime: r.stay.checkInTime,
        checkOutTime: r.stay.checkOutTime,
        excludeRequestId: r._id,
      })
      const reservations = await queries.findReservations({
        hostelId: h._id,
        ...reservationPeriod({ ...r.stay, fromDate: from, toDate: to }),
        excludeRequestId: r._id,
      })
      hostels.push({
        _id: h._id,
        name: h.name,
        rooms: stats?.totalRooms || 0,
        residentAssignedRooms: stats?.occupiedRoomsCount || 0,
        emptyGuestRooms: guest.availableRooms,
        h4Reservations: reservations.length,
      })
    }
    return success({ hostels, from, to })
  },
  async options(user) {
    const u = await freshUser(user)
    if (!u) return forbidden()
    const faculty = await userQueries.findUsers(
      { role: "Academics", email: /@iiti\.ac\.in$/i },
      { select: "name email", lean: true, sort: { name: 1 } },
    )
    const hostels =
      isDesk(u) || ["Hostel Supervisor", "Hostel Gate"].includes(u.role)
        ? await hostelQueries.findNonArchivedHostelsSorted()
        : []
    const scope = await hostelScope(u)
    const config = isOffice(u) ? await getAccommodationConfig() : null
    return success({
      faculty,
      hostels: isDesk(u)
        ? hostels.map((h) => ({ _id: h._id, name: h.name, type: h.type }))
        : hostels.filter((h) => scope.includes(String(h._id))).map((h) => ({ _id: h._id, name: h.name, type: h.type })),
      canCreate: u.role === "Academics" && institutional(u.email),
      canRecommend: u.role === "Academics" && institutional(u.email),
      role: u.role,
      subRole: u.subRole,
      config,
    })
  },
  async list(user, params = {}) {
    const u = await freshUser(user)
    if (!u) return forbidden()
    const conditions = [await scopeFilter(u)]
    if (params.mine === "true") conditions.push({ requesterUserId: u._id })
    if (params.queue === "faculty")
      conditions.push({
        "h4.facultyUserId": u._id,
        $or: [{ currentStage: "faculty" }, { "h4.amendment.stage": "faculty" }],
      })
    if (params.queue === "office")
      conditions.push({ $or: [{ currentStage: "office" }, { "h4.amendment.stage": "office" }] })
    if (params.queue === "chief")
      conditions.push({ $or: [{ currentStage: "chief" }, { "h4.amendment.stage": "chief" }] })
    if (params.queue === "payments")
      conditions.push({ $or: [{ "payment.status": "Submitted" }, { "additionalPayments.status": "Submitted" }] })
    if (params.queue === "rooms")
      conditions.push({
        status: S.PAYMENT_VERIFIED,
        "h4.amendment.stage": "",
        "payment.status": "Verified",
        additionalPayments: { $not: { $elemMatch: { status: { $ne: "Verified" } } } },
      })
    if (params.status && Object.values(S).includes(params.status)) conditions.push({ status: params.status })
    for (const [param, path] of [
      ["facultyId", "h4.facultyUserId"],
      ["creatorId", "requesterUserId"],
      ["batchId", "h4.batchId"],
    ])
      if (params[param]) {
        if (!validId(params[param])) return badRequest("Invalid filter ID")
        conditions.push({ [path]: params[param] })
      }
    if (clean(params.search)) {
      const regex = new RegExp(clean(params.search, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      conditions.push({
        $or: [
          { applicantName: regex },
          { applicantEmail: regex },
          { "h4.batchLabel": regex },
          { "h4.facultyName": regex },
          { "h4.creatorName": regex },
        ],
      })
    }
    const page = Math.max(1, parseInt(params.page) || 1),
      limit = Math.max(1, Math.min(100, parseInt(params.limit) || 25))
    const filter = { $and: conditions }
    const [items, total] = await Promise.all([
      queries.listH4(filter, { skip: (page - 1) * limit, limit }),
      queries.countH4(filter),
    ])
    const [hostels, rooms] = await Promise.all([
      hostelQueries.findHostelsByIds(
        [
          ...new Set(
            items
              .map((r) => r.allotment?.hostelId)
              .filter(Boolean)
              .map(String),
          ),
        ],
        "name",
      ),
      hostelQueries.findRoomsByIds(items.flatMap((r) => r.rooms.map((a) => a.roomId))),
    ])
    const hostelNames = new Map(hostels.map((h) => [String(h._id), h.name]))
    const roomLabels = new Map(
      rooms.map((room) => [String(room._id), [room.unitId?.unitNumber, room.roomNumber].filter(Boolean).join(" / ")]),
    )
    const rows = items.map((r) => ({
      ...r,
      hostelName: hostelNames.get(String(r.allotment?.hostelId)) || "",
      roomLabel: roomLabels.get(String(r.rooms[0]?.roomId)) || "",
    }))
    return success({
      items: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total },
    })
  },
  async get(id, user) {
    if (!validId(id)) return badRequest("Invalid request ID")
    const r = await queries.findH4ById(id, { lean: true })
    if (!r) return notFound("H4 request")
    const u = await freshUser(user)
    if (!u || !(await canRead(r, u))) return forbidden()
    const hostels = r.allotment?.hostelId
      ? await hostelQueries.findHostelsByIds([r.allotment.hostelId], "name type")
      : []
    const rooms = r.rooms?.length ? await hostelQueries.findRoomsByIds(r.rooms.map((a) => a.roomId)) : []
    return success({ ...r, hostel: hostels[0] || null, room: rooms[0] || null })
  },
  async createBatch(body, user) {
    const u = await freshUser(user)
    if (!u || u.role !== "Academics" || !institutional(u.email))
      return forbidden("Only IIT Indore Academics users can create H4 requests")
    const faculty = await facultyFor(body.facultyUserId)
    if (!faculty) return badRequest("Select an IIT Indore Academics user as faculty")
    const rows = body.students
    if (!Array.isArray(rows) || !rows.length || rows.length > 100) return badRequest("Add between 1 and 100 students")
    if (!clean(body.label, 120)) return badRequest("Enter a batch title")
    if (body.recommend === true && (u.role !== "Academics" || String(u._id) !== String(faculty._id)))
      return forbidden("Only the selected faculty can submit and recommend")
    const emails = new Set()
    for (let i = 0; i < rows.length; i++) {
      const error = validateStudent(rows[i], body.draft === true)
      if (error) return badRequest(`Student ${i + 1}: ${error}`)
      const key = `${clean(rows[i].email).toLowerCase()}:${day(rows[i].stay?.fromDate)}`
      if (rows[i].email && rows[i].stay?.fromDate) {
        if (emails.has(key)) return badRequest(`Student ${i + 1}: duplicate email and start date in this batch`)
        emails.add(key)
      }
    }
    const result = await withTransaction(async (session) => {
      const batch = await owner.createBatch(
        { label: clean(body.label, 120), creatorUserId: u._id, facultyUserId: faculty._id },
        { session },
      )
      const items = []
      for (const s of rows) {
        const r = owner.buildRequest({
          typeKey: "intern",
          requesterUserId: u._id,
          status: S.DRAFT,
          h4: { batchId: batch._id, batchLabel: batch.label, creatorName: u.name, creatorEmail: u.email },
          timeline: [],
        })
        applyStudent(r, s, faculty, body.draft === true)
        r.quote = emptyQuote({ persons: 1, nights: r.nights })
        if (body.draft === true) audit(r, u, "Draft saved", S.DRAFT)
        else routeSubmission(r, u, body.recommend === true)
        await owner.persist(r, { session })
        if (r.status !== S.DRAFT) await owner.queueH4Notification(r._id, r.h4.revision, { session })
        items.push(r.toObject())
      }
      return created({ batch, items })
    })
    for (const r of result.data.items) if (r.status !== S.DRAFT) await h4Notifications.handoff(r)
    return result
  },
  async edit(id, body, user) {
    const result = await mutate(id, body, user, async (r, u) => {
      if (!(isCreator(r, u) || isOffice(u))) return forbidden()
      if (!PRE_REVIEW.includes(r.status) && !(isOffice(u) && BEFORE_PAYMENT.includes(r.status)))
        return badRequest("Use a date-change request for an approved stay")
      const error = validateStudent(body.student, body.draft === true)
      if (error) return badRequest(error)
      const faculty = await facultyFor(body.facultyUserId)
      if (!faculty) return badRequest("Select an eligible faculty")
      if (body.recommend === true && !isFaculty({ h4: { facultyUserId: faculty._id } }, u))
        return forbidden("Only the selected faculty can recommend")
      applyStudent(r, body.student, faculty, body.draft === true)
      r.quote = emptyQuote({ persons: 1, nights: r.nights })
      r.currentStage = null
      // Prior approvals remain in audit; the new revision starts at faculty.
      if (body.draft === true) audit(r, u, "Material details updated; approvals require renewal", S.DRAFT)
      else routeSubmission(r, u, body.recommend === true)
    })
    if (result.success) await h4Notifications.invalidateAccess(id)
    return notifyResult(result)
  },
  async decision(id, body, user, stage) {
    const result = await mutate(id, body, user, async (r, u, session) => {
      if (stage === "faculty" ? !isFaculty(r, u) : stage === "office" ? !isOffice(u) : !isChief(u)) return forbidden()
      if (approvalStage(r) !== stage || isClosed(r)) return badRequest("This request is no longer in your queue")
      const expected = {
        faculty: S.PENDING_FA_RECOMMENDATION,
        office: S.PENDING_CWO_CAPACITY,
        chief: S.PENDING_CW_APPROVAL,
      }
      if (!r.h4.amendment?.stage && r.status !== expected[stage])
        return badRequest("This request is no longer in your queue")
      const action = body.action
      if (!["approve", "request_modification", "reject"].includes(action)) return badRequest("Choose a valid decision")
      const reason = clean(body.reason, 1000)
      if (action !== "approve" && !reason) return badRequest("Enter a reason")
      if (action === "approve" && stage === "faculty" && body.confirmPayer !== true)
        return badRequest("Confirm who will pay the accommodation charge")
      if (action === "approve" && stage === "office" && body.confirmAvailability !== true)
        return badRequest("Confirm that accommodation availability has been checked")
      const amendment = !!r.h4.amendment?.stage
      if (amendment && stage === "office" && body.batch === true)
        return badRequest("Review date changes individually to set their additional charges")
      if (action !== "approve") {
        if (amendment) {
          const c = changeRow(r)
          c.status = "rejected"
          c.decidedBy = u._id
          c.decidedAt = new Date()
          c.decisionNote = reason
          r.h4.amendment = { changeId: null, stage: "", extraAmount: 0 }
          audit(r, u, `Date change ${action === "reject" ? "rejected" : "returned"}: ${reason}`)
        } else {
          r.currentStage = null
          audit(r, u, reason, action === "reject" ? S.REJECTED : S.RETURNED_TO_STUDENT)
        }
        approve(r, u, amendment ? `date-change:${stage}` : stage, action, reason)
        return
      }
      if (stage === "faculty") {
        // Check the current user record again; revoked Academics users cannot recommend.
        if (!(await facultyFor(u._id))) return forbidden("Faculty eligibility changed")
        r.h4.payer.verifiedBy = u._id
        r.h4.payer.verifiedAt = new Date()
      }
      if (amendment && stage === "office") {
        const amount = Number(body.extraAmount ?? 0)
        if (!Number.isFinite(amount) || amount < 0 || amount > 10000000)
          return badRequest("Enter a valid additional accommodation charge")
        r.h4.amendment.extraAmount = Math.round(amount * 100) / 100
      }
      approve(r, u, amendment ? `date-change:${stage}` : stage, stage === "faculty" ? "recommend" : "approve", reason)
      const next = { faculty: "office", office: "chief", chief: "" }[stage]
      if (amendment) {
        if (stage === "chief") {
          const c = changeRow(r)
          const stay = { ...r.stay.toObject(), fromDate: c.requestedFromDate, toDate: c.requestedToDate }
          if (r.rooms.length) {
            const room = (await hostelQueries.findRoomsByIds([r.rooms[0].roomId]))[0]
            if (!room) return notFound("Assigned room")
            const preview = await inspectRoom(
              r,
              { ...body, roomNumber: room.roomNumber, unitNumber: room.unitId?.unitNumber || "" },
              u,
              { session, stay },
            )
            const failure = acknowledgePreview(preview, body)
            if (failure) return failure
            await persistReservation(r, preview, u, body.overrideReason || "Approved date change", session)
          }
          r.stay = stay
          r.nights = computeNights(stay.fromDate, stay.toDate)
          r.quote.nights = r.nights
          c.status = "approved"
          c.decidedBy = u._id
          c.decidedAt = new Date()
          c.decisionNote = reason
          c.extraAmount = r.h4.amendment.extraAmount
          if (c.extraAmount > 0)
            r.additionalPayments.push({
              amount: c.extraAmount,
              status: "Pending",
              label: "Date change charge",
              scheduleChangeId: c._id,
            })
          r.h4.amendment = { changeId: null, stage: "", extraAmount: 0 }
          audit(
            r,
            u,
            `Date change approved: ${day(c.requestedFromDate.toISOString())} to ${day(c.requestedToDate.toISOString())}`,
          )
        } else {
          r.h4.amendment.stage = next
          audit(r, u, `Date change recommended by ${stage}`)
        }
      } else {
        r.currentStage = next || null
        audit(
          r,
          u,
          `${stage === "faculty" ? "Faculty recommended; payer confirmed" : stage === "office" ? "CW Office checked availability" : "Chief Warden approved"}`,
          { faculty: S.PENDING_CWO_CAPACITY, office: S.PENDING_CW_APPROVAL, chief: S.CW_APPROVED }[stage],
        )
      }
    })
    if (result.success && isClosed(result.data)) await h4Notifications.invalidateAccess(id)
    return notifyResult(result)
  },
  async batchDecision(body, user) {
    if (
      !["faculty", "office", "chief"].includes(body.stage) ||
      !Array.isArray(body.requests) ||
      !body.requests.length ||
      body.requests.length > 100
    )
      return badRequest("Select between 1 and 100 requests")
    const results = []
    for (const row of body.requests) {
      try {
        const response = await this.decision(row.id, { ...body, revision: row.revision, batch: true }, user, body.stage)
        results.push({
          id: row.id,
          success: response.success,
          message: response.message || (response.success ? "Saved" : "Failed"),
          statusCode: response.statusCode,
        })
      } catch (e) {
        results.push({ id: row.id, success: false, message: "Could not save this request. Refresh and retry." })
      }
    }
    return success({ results })
  },
  async schedule(id, body, user) {
    const result = await mutate(id, body, user, (r, u) => {
      if (!(isCreator(r, u) || isFaculty(r, u) || isOffice(u) || u.external === "intern")) return forbidden()
      if (isClosed(r) || BEFORE_PAYMENT.includes(r.status))
        return badRequest("Date changes are available after the payment request")
      if (r.h4.amendment?.stage) return conflict("A date change is already pending")
      if (!["postpone", "extend"].includes(body.type) || !clean(body.reason))
        return badRequest("Select the date change and enter a reason")
      const stay = stayInput({ ...r.stay.toObject(), fromDate: body.fromDate, toDate: body.toDate })
      if (stay.error) return badRequest(stay.error)
      if (body.type === "extend" && (+stay.fromDate !== +r.stay.fromDate || stay.toDate <= r.stay.toDate))
        return badRequest("An extension keeps the start date and increases the end date")
      if (body.type === "postpone" && (stay.fromDate <= r.stay.fromDate || r.checkInAt))
        return badRequest("Postpone to a later start date before check-in")
      r.scheduleChanges.push({
        type: body.type,
        status: "pending",
        requestedFromDate: stay.fromDate,
        requestedToDate: stay.toDate,
        previousFromDate: r.stay.fromDate,
        previousToDate: r.stay.toDate,
        reason: clean(body.reason),
        requestedAt: new Date(),
      })
      r.h4.amendment = { changeId: r.scheduleChanges.at(-1)._id, stage: "faculty", extraAmount: 0 }
      audit(
        r,
        u,
        "Date change submitted for faculty, office and Chief Warden review; current reservation remains effective",
      )
    })
    return notifyResult(result)
  },
  async cancel(id, body, user) {
    const result = await mutate(id, body, user, async (r, u, session) => {
      if (!(isOffice(u) || isChief(u) || (isCreator(r, u) && BEFORE_PAYMENT.includes(r.status))))
        return forbidden("Only CW Office or Chief Warden can cancel after a payment request")
      if (isClosed(r)) return badRequest("This request is already closed")
      if (!clean(body.reason)) return badRequest("Enter a cancellation reason")
      await owner.releaseReservation(r._id, "Cancelled", { session })
      r.currentStage = null
      if (r.h4.amendment?.stage) {
        const c = changeRow(r)
        c.status = "rejected"
        c.decidedBy = u._id
        c.decidedAt = new Date()
        c.decisionNote = "Stay cancelled"
      }
      r.h4.amendment.stage = ""
      r.h4.cancellation = { reason: clean(body.reason), by: u._id, at: new Date(), refundNote: clean(body.refundNote) }
      audit(
        r,
        u,
        `Cancelled: ${clean(body.reason)}. Payments retained; any refund requires accounts handling.`,
        S.CANCELLED,
      )
    })
    if (result.success) await h4Notifications.invalidateAccess(id)
    return notifyResult(result)
  },
  async arrival(id, body, user, checkout = false) {
    const result = await mutate(id, body, user, async (r, u, session) => {
      if (
        !["Hostel Gate", "Hostel Supervisor"].includes(u.role) ||
        !(await hostelScope(u)).includes(String(r.allotment.hostelId))
      )
        return forbidden()
      if (checkout ? ![S.ROOMS_ASSIGNED, S.CHECKED_IN].includes(r.status) : r.status !== S.ROOMS_ASSIGNED)
        return badRequest(checkout ? "The stay must have an assigned room" : "Assign a room before check-in")
      if (!checkout && !paid(r)) return badRequest("Verify all payments before check-in")
      if (checkout) {
        if (r.h4.amendment?.stage) {
          const c = changeRow(r)
          c.status = "rejected"
          c.decisionNote = "Stay closed"
          r.h4.amendment.stage = ""
        }
        r.checkOutAt = new Date()
        await owner.releaseReservation(r._id, "Checked out", { session })
      } else r.checkInAt = new Date()
      audit(
        r,
        u,
        checkout ? "Stay closed; H4 reservation released" : "Checked in",
        checkout ? S.CHECKED_OUT : S.CHECKED_IN,
      )
    })
    if (result.success && checkout) await this.ensureInvoice(id)
    return notifyResult(result)
  },
  async ensureInvoice(id) {
    return withLock(`lock:h4:request:${id}`, 30, async () => {
      const r = await queries.findH4ById(id)
      if (!r || ![S.CHECKED_OUT, S.INVOICED].includes(r.status) || !paid(r)) return
      if (r.status === S.INVOICED && r.invoice?.generatedAt) return
      if (!r.invoice?.generatedAt) await accommodationService._issueInvoice(r, { sendEmail: false })
      audit(r, null, "Accommodation invoice generated", S.INVOICED)
      r.h4.revision += 1
      await owner.persist(r)
      await h4Notifications.handoff(r.toObject())
    })
  },
  async invoice(id, user, external = false) {
    if (!validId(id)) return badRequest("Invalid request ID")
    const r = await queries.findH4ById(id, { lean: true })
    if (!r) return notFound("H4 request")
    if (!external && !(await canRead(r, await freshUser(user)))) return forbidden()
    if (!r.invoice?.generatedAt) return notFound("Invoice")
    let buffer
    if (r.invoice.pdfFileRef) ({ buffer } = await fileAccessService.getBuffer(r.invoice.pdfFileRef))
    else {
      const h = await hostelQueries.findHostelById(r.allotment.hostelId)
      const config = await getAccommodationConfig()
      buffer = await renderInvoicePdf(buildInvoiceModel({ request: r, hostelName: h?.name || "", gstin: config.gstin }))
    }
    return success({
      buffer,
      contentType: "application/pdf",
      filename: `${r.invoice.number.replace(/[^\w-]/g, "-")}.pdf`,
    })
  },
  async exportInvoices(params, user) {
    const u = await freshUser(user)
    if (!isAccounts(u)) return forbidden()
    const from = new Date(params.from),
      to = new Date(params.to)
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || to < from || (to - from) / 86400000 > 366)
      return badRequest("Choose an invoice date range of up to 366 days")
    to.setUTCHours(23, 59, 59, 999)
    const filter = { "invoice.generatedAt": { $gte: from, $lte: to } }
    if ((await queries.countH4(filter)) > 10000)
      return badRequest("This export exceeds 10,000 invoices. Choose a shorter date range.")
    const rows = await queries.listH4(filter, { limit: 10000 })
    const exported = buildInvoiceExportExcel({
      fromLabel: params.from,
      toLabel: params.to,
      rows: invoiceExportRows(
        rows.map((r) => ({ ...r, applicantName: r.h4.payer.name, applicantEmail: r.h4.payer.email })),
      ),
    })
    return success({
      buffer: Buffer.from(exported.xml),
      contentType: exported.contentType,
      filename: "h4-invoices.xls",
    })
  },
  async closeEndedStays() {
    let count = 0
    for (const row of await queries.findH4Ended()) {
      const r = await queries.findH4ById(row._id, { lean: true })
      // System closure uses the same mutation and hostel locks as the gate.
      const result = await mutate(
        String(r._id),
        { revision: r.h4.revision },
        { external: "system" },
        async (request, _, session) => {
          if (![S.ROOMS_ASSIGNED, S.CHECKED_IN].includes(request.status)) return badRequest("Already closed")
          const end = new Date(
            `${new Date(request.stay.toDate).toISOString().slice(0, 10)}T${request.stay.checkOutTime || "11:00"}:00+05:30`,
          )
          if (end > new Date()) return badRequest("Stay has not ended")
          await owner.releaseReservation(request._id, "Stay ended", { session })
          if (request.h4.amendment?.stage) {
            const c = changeRow(request)
            c.status = "rejected"
            c.decidedAt = new Date()
            c.decisionNote = "Scheduled stay ended"
          }
          request.checkOutAt = new Date()
          request.h4.amendment.stage = ""
          audit(request, null, "Scheduled stay end; reservation released", S.CHECKED_OUT)
        },
      )
      if (result.success) {
        count++
        await this.ensureInvoice(String(r._id))
      }
    }
    for (const row of await queries.findH4AwaitingInvoice())
      await this.ensureInvoice(String(row._id)).catch((e) => console.error("H4 invoice retry pending:", e.message))
    return count
  },
}
