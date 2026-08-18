/**
 * Accommodation Service (front-half of the workflow).
 *
 * Submit -> Faculty Advisor recommendation (one-time token) -> Chief Warden
 * approve / request-modification / reject. Payment, allotment, rooms, and
 * invoicing are handled in later phases.
 */

import {
  success,
  created,
  badRequest,
  notFound,
  forbidden,
} from "../../../../services/base/index.js"
import {
  ACCOMMODATION_STATUS,
  ACCOMMODATION_ACTIONS,
  PAYMENT_STATUS,
  PAYMENT_MODE,
  SCHEDULE_CHANGE_TYPE,
  SCHEDULE_CHANGE_STATUS,
} from "../../../../models/index.js"
import { studentProfileQueries } from "../../../../services/student/studentProfileQueries.service.js"
import { roomOwner } from "../../../../services/hostel/roomOwner.service.js"
import { hostelQueries } from "../../../../services/hostel/hostelQueries.service.js"
import { accommodationOwner } from "../../../../services/accommodation/accommodationOwner.service.js"
import { accommodationQueries } from "../../../../services/accommodation/accommodationQueries.service.js"
import {
  createActionLinkToken,
  findActionLinkTokenByRawToken,
  consumeActionLinkToken,
  isActionLinkTokenExpired,
  invalidateActionLinkTokens,
  ACTION_LINK_TOKEN_TYPE,
} from "../../../../services/action-links/action-link-token.service.js"
import { getAccommodationType, listAccommodationTypes } from "./accommodation.types.service.js"
import {
  buildQuoteFromGuestCharges,
  computeNights,
  emptyQuote,
  getAccommodationConfig,
  gstOptionsFromConfig,
  priceOptionsFromConfig,
} from "./accommodation.quote.js"
import {
  applyStatus,
  CANCELLABLE_STATUSES,
  DEFERRED_PAYABLE_STATUSES,
  TERMINAL_STATUSES,
} from "./accommodation.workflow.js"
import {
  STAGE,
  CW_DECISION,
  FA_DECISION,
  PAYMENT_DECISION,
  MANUAL_SETTLEMENT,
  SCHEDULE_DECISION,
  SCHEDULE_LIMITS,
  CW_AUTO_APPROVE_HOURS,
  FA_TOKEN_TTL_MS,
  UTR_RE,
} from "./accommodation.constants.js"
import { resolveStayTimes } from "./accommodation.stay.js"
import { buildInvoiceModel, buildInvoiceNumber, renderInvoicePdf } from "./accommodation.invoice-pdf.js"
import { storageClient } from "../../../../services/storage/storage.client.js"
import { fileAccessService } from "../../../../services/storage/file-access.service.js"
import * as accommodationEmails from "./accommodation.emails.js"
import {
  accountantEmails,
  chiefWardenEmails,
  chiefWardenOfficeEmails,
  supervisorsForHostel,
} from "./accommodation.recipients.js"
import { withLock, LOCK_NOT_ACQUIRED } from "../../../../services/lock/distributedLock.js"
import {
  getHostelGuestAvailability,
  listHostelsGuestAvailability,
  getGuestRoomAvailability,
  roomsNeededFor,
} from "./accommodation.availability.js"

const FA_TOKEN_TYPE = ACTION_LINK_TOKEN_TYPE.ACCOMMODATION_FA_RECOMMENDATION
const cwDeadline = () => new Date(Date.now() + CW_AUTO_APPROVE_HOURS * 60 * 60 * 1000)
const isOwner = (request, user) => String(request.requesterUserId) === String(user?._id)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ROUND2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Statuses where a student may ask to postpone or extend the stay. */
const SCHEDULE_CHANGE_ELIGIBLE = [
  ACCOMMODATION_STATUS.CW_APPROVED,
  ACCOMMODATION_STATUS.PAYMENT_REQUESTED,
  ACCOMMODATION_STATUS.PAYMENT_DEFERRED,
  ACCOMMODATION_STATUS.PAYMENT_SUBMITTED,
  ACCOMMODATION_STATUS.PAYMENT_VERIFIED,
  ACCOMMODATION_STATUS.HOSTEL_ALLOTTED,
  ACCOMMODATION_STATUS.ROOMS_ASSIGNED,
  ACCOMMODATION_STATUS.CHECKED_IN,
]

/** Payment amount has already been set / payment step is live. */
const paymentStepPassed = (request) =>
  Number(request.payment?.amount) > 0 ||
  [
    ACCOMMODATION_STATUS.PAYMENT_REQUESTED,
    ACCOMMODATION_STATUS.PAYMENT_DEFERRED,
    ACCOMMODATION_STATUS.PAYMENT_SUBMITTED,
    ACCOMMODATION_STATUS.PAYMENT_VERIFIED,
    ACCOMMODATION_STATUS.HOSTEL_ALLOTTED,
    ACCOMMODATION_STATUS.ROOMS_ASSIGNED,
    ACCOMMODATION_STATUS.CHECKED_IN,
    ACCOMMODATION_STATUS.CHECKED_OUT,
    ACCOMMODATION_STATUS.INVOICED,
  ].includes(request.status)

const initialPaymentSettled = (request) => request.payment?.status === PAYMENT_STATUS.VERIFIED

const openAdditionalPayment = (request) =>
  (request.additionalPayments || []).find((p) =>
    [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.DEFERRED, PAYMENT_STATUS.REJECTED].includes(p.status)
  )

const submittedAdditionalPayment = (request) =>
  (request.additionalPayments || []).find((p) => p.status === PAYMENT_STATUS.SUBMITTED)

const parseStayDate = (raw) => {
  if (raw == null || raw === "") return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
}

/** Parse optional UTR + paidAt for accountant corrections. Returns { error } or { utr?, paidAt? }. */
const parsePaymentDetails = (body, { requireBoth = false } = {}) => {
  const hasUtr = body?.utr !== undefined && body?.utr !== null && String(body.utr).trim() !== ""
  const hasPaidAt = body?.paidAt !== undefined && body?.paidAt !== null && String(body.paidAt).trim() !== ""

  if (requireBoth && (!hasUtr || !hasPaidAt)) {
    return { error: "UTR and payment date are required" }
  }
  if (!hasUtr && !hasPaidAt) {
    return { error: "Provide a UTR and/or payment date to update" }
  }

  let utr
  if (hasUtr) {
    utr = String(body.utr).replace(/\s/g, "")
    if (!UTR_RE.test(utr)) return { error: "UTR must be a 12-digit number" }
  }

  let paidAt
  if (hasPaidAt) {
    paidAt = new Date(body.paidAt)
    if (Number.isNaN(paidAt.getTime())) return { error: "Payment date is invalid" }
    if (paidAt.getTime() > Date.now()) return { error: "Payment date cannot be in the future" }
  }

  return { utr, paidAt, hasUtr, hasPaidAt }
}

/**
 * `withLock` gives up the instant the lock is held, which would bounce a second
 * office that is simply allotting a different room at the same time. Allotment
 * is short, so waiting a moment turns contention into a queue instead of an
 * error — only genuine congestion reaches the caller.
 */
const withLockRetry = async (key, ttlSeconds, task, { attempts = 6, delayMs = 150 } = {}) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await withLock(key, ttlSeconds, task)
    if (result !== LOCK_NOT_ACQUIRED) return result
    if (attempt < attempts - 1) await sleep(delayMs)
  }
  return LOCK_NOT_ACQUIRED
}

/**
 * Page the desk that now owns the request. Fire-and-forget: a notification
 * failure must never roll back the transition that caused it.
 */
const notifyStaff = (resolveRecipients, payload) => {
  Promise.resolve()
    .then(async () => {
      const to = await resolveRecipients()
      await accommodationEmails.sendStaffQueueEmail({ to, ...payload })
    })
    .catch((error) => console.error("Accommodation staff notification failed:", error.message))
}

/** Tell the allotted hostel's supervisor a booking is ready for room assignment. */
const notifySupervisorReadyForRooms = (request) => {
  notifyStaff(() => supervisorsForHostel(request.allotment?.hostelId), {
    heading: "A guest booking has been allotted to your hostel and needs rooms.",
    action: "Assign rooms",
    request,
  })
}

// Compact requester-student summary used in the FA email and the public
// recommendation page so the advisor can see who they are vouching for.
const buildStudentSummary = async (userId) => {
  try {
    const p = await studentProfileQueries.getFullStudentData(userId)
    if (!p) return null
    return {
      name: p.name,
      email: p.email,
      phone: p.phone,
      rollNumber: p.rollNumber,
      department: p.department,
      degree: p.degree,
      year: p.year,
      hostel: p.hostel || "",
      displayRoom: p.displayRoom || "",
    }
  } catch {
    return null
  }
}
const pad2 = (n) => String(n).padStart(2, "0")

// Minimum lead time (in working days, Mon–Fri) between today and the stay start.
const MIN_LEAD_WORKING_DAYS = 3

// Add `n` working days (skipping Sat/Sun) to a date, returning a new Date.
const addWorkingDays = (start, n) => {
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return d
}

// Date-only key (YYYY-MM-DD) for calendar comparison, TZ-safe for date-only input.
const dateKey = (v) => (typeof v === "string" ? v.slice(0, 10) : `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`)

const ROOM_PREFERENCES = new Set(["Single", "Double"])

const normalizeGuestAge = (value) => {
  if (value === "" || value === null || value === undefined) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Prefer request body, then profile, then an existing request value. */
const resolveFacultyAdvisorEmail = (...candidates) => {
  for (const candidate of candidates) {
    const email = String(candidate || "").trim().toLowerCase()
    if (email) return email
  }
  return null
}

const validateFacultyAdvisorEmail = (email) => {
  if (!email) return "Faculty advisor / supervisor email is required"
  if (!EMAIL_RE.test(email)) return "Enter a valid faculty advisor / supervisor email"
  return null
}

const validateGuestsAndStay = (body) => {
  const guests = Array.isArray(body.guests) ? body.guests : []
  if (guests.length === 0) return "At least one guest is required"
  for (const guest of guests) {
    if (!guest?.name || !guest?.gender) return "Each guest needs a name and gender"
    const age = normalizeGuestAge(guest?.age)
    if (age === null) return "Each guest needs an age"
    if (age < 0 || age > 150) return "Guest age must be between 0 and 150"
    if (!guest?.relation || !String(guest.relation).trim()) return "Each guest needs a relation to the student"
    const aadhaar = String(guest?.aadharNumber || "").replace(/\s/g, "")
    if (!aadhaar) return "Each guest needs an Aadhaar number"
    if (!/^\d{12}$/.test(aadhaar)) return "Aadhaar number must be 12 digits"
  }
  if (!ROOM_PREFERENCES.has(body?.roomPreference)) {
    return "Room preference (Single or Double) is required"
  }
  const fromDate = body?.stay?.fromDate
  const toDate = body?.stay?.toDate
  if (!fromDate || !toDate) return "Stay from/to dates are required"
  if (new Date(toDate).getTime() <= new Date(fromDate).getTime()) {
    return "Stay end date must be after the start date"
  }
  const earliest = addWorkingDays(new Date(), MIN_LEAD_WORKING_DAYS)
  if (dateKey(fromDate) < dateKey(earliest)) {
    return `Requests must be raised at least ${MIN_LEAD_WORKING_DAYS} working days in advance. The earliest start date is ${dateKey(earliest)}.`
  }
  const times = resolveStayTimes(body?.stay)
  if (times.error) return times.error
  return null
}

const normalizeGuests = (guests = []) =>
  guests.map((guest) => ({
    ...guest,
    age: normalizeGuestAge(guest?.age),
    aadharNumber: String(guest?.aadharNumber || "").replace(/\s/g, ""),
    relation: String(guest?.relation || "").trim(),
    name: String(guest?.name || "").trim(),
  }))

export const accommodationService = {
  async getTypes() {
    const types = await listAccommodationTypes()
    return success(types)
  },

  /** Amounts are set by Chief Warden Office — students only get person/night counts. */
  async previewQuote(body) {
    const persons = Number(body.persons) || (Array.isArray(body.guests) ? body.guests.length : 0)
    const nights = computeNights(body?.stay?.fromDate, body?.stay?.toDate)
    return success(emptyQuote({ persons, nights }))
  },

  async submitRequest(body, user) {
    const typeKey = body.typeKey || "parents-siblings"
    const type = await getAccommodationType(typeKey)
    if (!type) return badRequest("Invalid accommodation type")

    if (
      Array.isArray(type.eligibleRequesterRoles) &&
      type.eligibleRequesterRoles.length > 0 &&
      !type.eligibleRequesterRoles.includes(user.role)
    ) {
      return forbidden("You are not eligible to submit this accommodation type")
    }
    if (type.requesterEmailDomain) {
      const email = String(user.email || "").toLowerCase()
      if (!email.endsWith(`@${type.requesterEmailDomain.toLowerCase()}`)) {
        return badRequest(`Only @${type.requesterEmailDomain} email accounts can submit this request`)
      }
    }

    const validationError = validateGuestsAndStay(body)
    if (validationError) return badRequest(validationError)

    const guests = normalizeGuests(body.guests)
    const fromDate = body.stay.fromDate
    const toDate = body.stay.toDate
    const stayTimes = resolveStayTimes(body.stay)
    const persons = guests.length
    const nights = computeNights(fromDate, toDate)
    // Amount is set later by Chief Warden Office — no auto-calculated estimate.
    const quote = emptyQuote({ persons, nights })

    const profile = await studentProfileQueries.findByUserId(user._id, { lean: true })
    const facultyAdvisorEmail = resolveFacultyAdvisorEmail(
      body.facultyAdvisorEmail,
      profile?.facultyAdvisorEmail
    )
    const faError = validateFacultyAdvisorEmail(facultyAdvisorEmail)
    if (faError) return badRequest(faError)

    const request = accommodationOwner.buildRequest({
      typeKey,
      requesterUserId: user._id,
      applicantName: body.applicantName || user.name,
      applicantPhone: body.applicantPhone || user.phone,
      applicantEmail: body.applicantEmail || user.email,
      facultyAdvisorEmail,
      permanentAddress: body.permanentAddress,
      addressProof: body.addressProof || {},
      guests,
      roomPreference: body.roomPreference,
      stay: { fromDate, toDate, ...stayTimes, purpose: body?.stay?.purpose },
      persons,
      nights,
      quote,
      status: ACCOMMODATION_STATUS.SUBMITTED,
    })
    request.timeline.push({ status: ACCOMMODATION_STATUS.SUBMITTED, by: user._id, at: new Date() })

    this._routeAfterSubmit(request)
    await accommodationOwner.persist(request)

    accommodationEmails
      .sendStudentSubmittedEmail({ to: user.email, studentName: request.applicantName, request })
      .catch(() => {})
    notifyStaff(chiefWardenOfficeEmails, {
      heading: "A new guest accommodation request needs a capacity check.",
      action: "Check capacity",
      request,
    })

    return created(request, "Accommodation request submitted")
  },

  // A freshly submitted/resubmitted request goes to the Chief Warden Office,
  // which checks that a hostel can actually take the guests on those dates.
  _routeAfterSubmit(request) {
    request.currentStage = STAGE.CW_OFFICE_CAPACITY
    request.stageDeadlineAt = null
    applyStatus(request, ACCOMMODATION_STATUS.PENDING_CWO_CAPACITY, {
      note: "Awaiting Chief Warden Office capacity check",
    })
  },

  // Routes a capacity-cleared request to the FA or straight to the Chief Warden.
  async _routeAfterCapacity(request, type) {
    const faStage = (type.approvalChain || []).find((stage) => stage.stage === STAGE.FACULTY_ADVISOR)

    if (faStage && request.facultyAdvisorEmail) {
      request.currentStage = STAGE.FACULTY_ADVISOR
      request.stageDeadlineAt = null
      applyStatus(request, ACCOMMODATION_STATUS.PENDING_FA_RECOMMENDATION, {
        note: "Awaiting faculty advisor recommendation",
      })

      const { rawToken } = await createActionLinkToken({
        type: FA_TOKEN_TYPE,
        subjectModel: "AccommodationRequest",
        subjectId: request._id,
        recipientEmail: request.facultyAdvisorEmail,
        payload: { studentName: request.applicantName, requestId: String(request._id) },
        expiresAt: new Date(Date.now() + FA_TOKEN_TTL_MS),
      })

      const student = await buildStudentSummary(request.requesterUserId)

      accommodationEmails
        .sendFacultyRecommendationRequestEmail({
          to: request.facultyAdvisorEmail,
          studentName: request.applicantName,
          rawToken,
          request,
          student,
        })
        .catch(() => {})
      return
    }

    request.currentStage = STAGE.CHIEF_WARDEN
    request.stageDeadlineAt = cwDeadline()
    applyStatus(request, ACCOMMODATION_STATUS.PENDING_CW_APPROVAL, {
      note: "Awaiting Chief Warden approval",
    })
    notifyStaff(chiefWardenEmails, {
      heading: "A guest accommodation request is waiting for your approval.",
      action: "Approve the request",
      request,
      extra: `<p>It is auto-approved if no decision is recorded within ${CW_AUTO_APPROVE_HOURS} hours.</p>`,
    })
  },

  async listRequests(user, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10))

    const filter = {}
    if (user.role === "Student" || query.mine === "true") {
      filter.requesterUserId = user._id
    }
    if (query.status) filter.status = query.status
    if (query.queue === "chiefWarden") filter.status = ACCOMMODATION_STATUS.PENDING_CW_APPROVAL

    const total = await accommodationQueries.countRequests(filter)
    const items = await accommodationQueries.listRequests(filter, {
      skip: (page - 1) * limit,
      limit,
    })

    // For staff queues, attach a compact requester-student summary so the
    // table can show who raised each request (name, roll, department, photo).
    if (user.role !== "Student" && items.length > 0) {
      const userIds = [...new Set(items.map((r) => String(r.requesterUserId)))]
      try {
        const profiles = await studentProfileQueries.getFullStudentData(userIds)
        const byUser = new Map(
          (Array.isArray(profiles) ? profiles : [profiles]).filter(Boolean).map((p) => [String(p.userId), p])
        )
        for (const item of items) {
          const p = byUser.get(String(item.requesterUserId))
          if (p) {
            item.student = {
              id: p.id,
              userId: p.userId,
              name: p.name,
              email: p.email,
              phone: p.phone,
              profileImage: p.profileImage,
              rollNumber: p.rollNumber,
              department: p.department,
              degree: p.degree,
              hostel: p.hostel,
              displayRoom: p.displayRoom,
            }
          }
        }
      } catch {
        /* non-fatal — table falls back to applicantName */
      }
    }

    return success({
      items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) || 1 },
    })
  },

  async getRequestById(requestId, user) {
    const request = await accommodationQueries.findRequestByIdLean(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (user.role === "Student" && !isOwner(request, user)) {
      return forbidden("You do not have access to this request")
    }

    // Attach the requester's student profile so staff can see a details card.
    let student = null
    try {
      student = await studentProfileQueries.getFullStudentData(request.requesterUserId)
    } catch {
      student = null
    }

    // Resolve assigned-room labels (room number / unit + the guests in each)
    // so the supervisor can see the assignment after it's done.
    let assignedRooms = []
    if (Array.isArray(request.rooms) && request.rooms.length > 0) {
      try {
        const roomDocs = await hostelQueries.findRoomsByIds(
          request.rooms.map((r) => r.roomId),
          { select: "roomNumber unitId" }
        )
        const roomMap = new Map(roomDocs.map((r) => [String(r._id), r]))
        assignedRooms = request.rooms.map((a) => {
          const doc = roomMap.get(String(a.roomId))
          return {
            roomId: a.roomId,
            roomNumber: doc?.roomNumber || "",
            unitNumber: doc?.unitId?.unitNumber || null,
            guestIndexes: a.guestIndexes || [],
            guests: (a.guestIndexes || []).map((i) => request.guests?.[i]?.name).filter(Boolean),
          }
        })
      } catch {
        assignedRooms = []
      }
    }

    // Resolve the allotted hostel name so the student/staff can see where the
    // guests are staying (allotment stores only the hostelId).
    let allottedHostelName = ""
    if (request.allotment?.hostelId) {
      try {
        const hostel = await hostelQueries.findHostelById(request.allotment.hostelId)
        allottedHostelName = hostel?.name || ""
      } catch {
        allottedHostelName = ""
      }
    }

    return success({ ...request, student, assignedRooms, allottedHostelName })
  },

  /**
   * The invoice PDF for anyone who can already see the request (the requesting
   * student, or staff). Serves the stored copy when there is one and re-renders
   * from the request otherwise, so a storage hiccup at issue time never leaves
   * the student without their invoice.
   */
  async getInvoiceFile(requestId, user) {
    const request = await accommodationQueries.findRequestByIdLean(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (user.role === "Student" && !isOwner(request, user)) {
      return forbidden("You do not have access to this request")
    }
    if (!request.invoice?.generatedAt) {
      return badRequest("No invoice has been generated for this request yet")
    }

    const filename = `${String(request.invoice.number || "invoice").replace(/[^\w-]+/g, "-")}.pdf`

    if (request.invoice.pdfFileRef) {
      try {
        const stored = await fileAccessService.getBuffer(request.invoice.pdfFileRef)
        if (stored?.buffer?.length) {
          return success({ buffer: stored.buffer, contentType: "application/pdf", filename })
        }
      } catch (error) {
        console.error("Stored accommodation invoice unavailable, re-rendering:", error.message)
      }
    }

    const config = await getAccommodationConfig()
    const hostel = request.allotment?.hostelId
      ? await hostelQueries.findHostelById(request.allotment.hostelId)
      : null
    const buffer = await renderInvoicePdf(
      buildInvoiceModel({
        request,
        hostelName: hostel?.name || "",
        gstin: config?.gstin || "",
        studentName: request.applicantName,
      })
    )
    return success({ buffer, contentType: "application/pdf", filename })
  },

  async cancelRequest(requestId, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (!isOwner(request, user)) return forbidden("You do not have access to this request")
    if (!CANCELLABLE_STATUSES.includes(request.status)) {
      return badRequest("This request can no longer be cancelled")
    }

    await invalidateActionLinkTokens({ type: FA_TOKEN_TYPE, subjectId: request._id }, "cancelled").catch(() => {})
    request.currentStage = null
    request.stageDeadlineAt = null
    applyStatus(request, ACCOMMODATION_STATUS.CANCELLED, { by: user._id })
    await accommodationOwner.persist(request)
    return success(request, 200, "Accommodation request cancelled")
  },

  /**
   * Staff cancellation. A student cannot pull out once payment is requested, so
   * this is the release valve for the cases that stall a booking: the guests
   * dropped out, the request was raised in error, or it is holding rooms it will
   * never use. Frees any held rooms; the money side is settled off-system.
   */
  async adminCancelRequest(requestId, body, user) {
    const reason = String(body?.reason || "").trim()
    if (!reason) return badRequest("A reason is required to cancel a request")

    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (TERMINAL_STATUSES.includes(request.status)) {
      return badRequest(`This request is already ${request.status.toLowerCase()}`)
    }

    const heldRoomIds = (request.rooms || []).map((r) => r.roomId)
    await invalidateActionLinkTokens({ type: FA_TOKEN_TYPE, subjectId: request._id }, "cancelled").catch(() => {})

    request.currentStage = null
    request.stageDeadlineAt = null
    applyStatus(request, ACCOMMODATION_STATUS.CANCELLED, { by: user._id, note: `Cancelled by office: ${reason}` })
    await accommodationOwner.persist(request)

    // Release the guest rooms back to the normal pool (atomic, best-effort).
    if (heldRoomIds.length > 0) {
      await roomOwner.releaseRooms(heldRoomIds).catch((error) => {
        console.error("Accommodation cancel: room release failed:", error.message)
      })
    }

    accommodationEmails
      .sendStudentDecisionEmail({
        requestId: request._id,
        to: request.applicantEmail,
        studentName: request.applicantName,
        status: request.status,
        reason,
      })
      .catch(() => {})
    return success(request, 200, "Request cancelled")
  },

  /**
   * Manual settlement by the accounts office, for money that never passes
   * through the portal — cash or a DD at the counter, a transfer reconciled from
   * a bank statement, or simply correcting a mistake. `mark_paid` settles the
   * bill (and issues the invoice for a deferred one); `mark_unpaid` puts it back
   * to outstanding.
   */
  async settlePaymentManually(requestId, action, body, user) {
    if (![MANUAL_SETTLEMENT.MARK_PAID, MANUAL_SETTLEMENT.MARK_UNPAID].includes(action)) {
      return badRequest("Invalid action")
    }
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (!request.payment?.amount) {
      return badRequest("No payment has been requested for this request yet")
    }

    const note = String(body?.note || "").trim()

    if (action === MANUAL_SETTLEMENT.MARK_UNPAID) {
      if (!note) return badRequest("A reason is required to mark a payment as unpaid")
      if (request.payment.status !== PAYMENT_STATUS.VERIFIED) {
        return badRequest("This payment is not currently marked as paid")
      }
      request.payment.status = request.payment.mode === PAYMENT_MODE.LATER
        ? PAYMENT_STATUS.DEFERRED
        : PAYMENT_STATUS.PENDING
      request.payment.verifiedBy = null
      request.payment.verifiedAt = null
      request.payment.note = note
      request.timeline.push({
        status: request.status,
        by: user._id,
        at: new Date(),
        note: `Payment marked unpaid: ${note}`,
      })
      await accommodationOwner.persist(request)
      return success(request, 200, "Payment marked as unpaid")
    }

    if (request.payment.status === PAYMENT_STATUS.VERIFIED) {
      return badRequest("This payment is already settled")
    }

    const method = String(body?.method || "").trim()
    if (!method) return badRequest("Record how the payment was received (cash, DD, bank transfer…)")
    const reference = String(body?.reference || "").replace(/\s/g, "")
    // A UTR is only meaningful for a transfer, so it is optional here — but if
    // one is given it must still be a real 12-digit UTR.
    if (reference && !UTR_RE.test(reference)) return badRequest("UTR must be a 12-digit number")

    // Payment (or pay-later) is still blocking room assignment — settling it
    // unlocks the supervisor. After rooms are already assigned, only payment.status moves.
    const wasBlockingProgress = [
      ACCOMMODATION_STATUS.PAYMENT_REQUESTED,
      ACCOMMODATION_STATUS.PAYMENT_SUBMITTED,
      ACCOMMODATION_STATUS.PAYMENT_DEFERRED,
    ].includes(request.status)

    request.payment.status = PAYMENT_STATUS.VERIFIED
    request.payment.verifiedBy = user._id
    request.payment.verifiedAt = new Date()
    request.payment.paidAt = body?.paidAt ? new Date(body.paidAt) : new Date()
    request.payment.note = [method, note].filter(Boolean).join(" — ")
    if (reference) request.payment.utr = reference
    if (!request.payment.mode) request.payment.mode = PAYMENT_MODE.NOW

    if (wasBlockingProgress) {
      applyStatus(request, ACCOMMODATION_STATUS.PAYMENT_VERIFIED, {
        by: user._id,
        note: `Marked paid at the office (${method})`,
      })
    } else {
      request.timeline.push({
        status: request.status,
        by: user._id,
        at: new Date(),
        note: `Marked paid at the office (${method})`,
      })
    }
    await accommodationOwner.persist(request)

    if (wasBlockingProgress) {
      notifySupervisorReadyForRooms(request)
    } else {
      // The stay is already running, so the invoice is due immediately.
      await this._issueInvoice(request).catch(() => {})
    }

    accommodationEmails
      .sendStudentDecisionEmail({
        requestId: request._id,
        to: request.applicantEmail,
        studentName: request.applicantName,
        status: "Payment Received",
        reason: `Recorded at the accounts office (${method}).`,
      })
      .catch(() => {})
    return success(request, 200, "Payment marked as received")
  },

  async resubmitRequest(requestId, body, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (!isOwner(request, user)) return forbidden("You do not have access to this request")
    if (request.status !== ACCOMMODATION_STATUS.RETURNED_TO_STUDENT) {
      return badRequest("Only returned requests can be resubmitted")
    }

    if (Array.isArray(body.guests)) request.guests = normalizeGuests(body.guests)
    if (body.stay) request.stay = { ...request.stay.toObject?.() ?? request.stay, ...body.stay }
    if (body.permanentAddress !== undefined) request.permanentAddress = body.permanentAddress
    if (body.addressProof) request.addressProof = body.addressProof
    if (body.roomPreference !== undefined) request.roomPreference = body.roomPreference
    if (body.facultyAdvisorEmail !== undefined) {
      request.facultyAdvisorEmail = String(body.facultyAdvisorEmail || "").trim().toLowerCase() || null
    }

    const validationError = validateGuestsAndStay({
      guests: request.guests,
      stay: request.stay,
      roomPreference: request.roomPreference,
    })
    if (validationError) return badRequest(validationError)

    const profile = await studentProfileQueries.findByUserId(user._id, { lean: true })
    request.facultyAdvisorEmail = resolveFacultyAdvisorEmail(
      request.facultyAdvisorEmail,
      profile?.facultyAdvisorEmail
    )
    const faError = validateFacultyAdvisorEmail(request.facultyAdvisorEmail)
    if (faError) return badRequest(faError)

    const type = await getAccommodationType(request.typeKey)
    if (!type) return badRequest("Invalid accommodation type")

    const stayTimes = resolveStayTimes(request.stay)
    request.stay.checkInTime = stayTimes.checkInTime
    request.stay.checkOutTime = stayTimes.checkOutTime
    request.stay.earlyCheckInHours = stayTimes.earlyCheckInHours
    request.stay.lateCheckOutHours = stayTimes.lateCheckOutHours

    request.persons = request.guests.length
    request.nights = computeNights(request.stay.fromDate, request.stay.toDate)
    // Clear any previous office-set charges; amount is re-set when payment is requested.
    request.quote = emptyQuote({ persons: request.persons, nights: request.nights })

    await invalidateActionLinkTokens({ type: FA_TOKEN_TYPE, subjectId: request._id }, "resubmitted").catch(() => {})
    applyStatus(request, ACCOMMODATION_STATUS.SUBMITTED, { by: user._id, note: "Resubmitted" })
    this._routeAfterSubmit(request)
    await accommodationOwner.persist(request)
    return success(request, 200, "Accommodation request resubmitted")
  },

  // Chief Warden Office capacity screening — the first gate every request hits.
  // The office sees free guest beds per hostel for the dates and decides whether
  // the stay can be housed at all before anyone else spends time on it.
  async capacityDecision(requestId, action, body, user) {
    const allowed = [CW_DECISION.APPROVE, CW_DECISION.REQUEST_MODIFICATION, CW_DECISION.REJECT]
    if (!allowed.includes(action)) return badRequest("Invalid decision")

    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (request.status !== ACCOMMODATION_STATUS.PENDING_CWO_CAPACITY) {
      return badRequest("This request is not awaiting a capacity check")
    }

    const reason = String(body?.reason || "").trim()
    if (action !== CW_DECISION.APPROVE && !reason) return badRequest("A reason is required")

    if (action === CW_DECISION.APPROVE) {
      const type = await getAccommodationType(request.typeKey)
      if (!type) return badRequest("Invalid accommodation type")

      request.approvals.push({
        stage: STAGE.CW_OFFICE_CAPACITY,
        action: ACCOMMODATION_ACTIONS.APPROVE,
        actorUserId: user._id,
        reason: reason || null,
        at: new Date(),
      })
      await this._routeAfterCapacity(request, type)
    } else {
      request.currentStage = null
      request.stageDeadlineAt = null
      const isReject = action === CW_DECISION.REJECT
      request.approvals.push({
        stage: STAGE.CW_OFFICE_CAPACITY,
        action: isReject ? ACCOMMODATION_ACTIONS.REJECT : ACCOMMODATION_ACTIONS.REQUEST_MODIFICATION,
        actorUserId: user._id,
        reason,
        at: new Date(),
      })
      applyStatus(
        request,
        isReject ? ACCOMMODATION_STATUS.REJECTED : ACCOMMODATION_STATUS.RETURNED_TO_STUDENT,
        { by: user._id, note: reason }
      )
    }

    await accommodationOwner.persist(request)
    accommodationEmails
      .sendStudentDecisionEmail({
        requestId: request._id,
        to: request.applicantEmail,
        studentName: request.applicantName,
        status: request.status,
        reason,
      })
      .catch(() => {})
    return success(request, 200, "Capacity decision recorded")
  },

  async chiefWardenDecision(requestId, action, body, user) {
    const allowed = [CW_DECISION.APPROVE, CW_DECISION.REQUEST_MODIFICATION, CW_DECISION.REJECT]
    if (!allowed.includes(action)) return badRequest("Invalid decision")

    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (request.status !== ACCOMMODATION_STATUS.PENDING_CW_APPROVAL) {
      return badRequest("This request is not awaiting Chief Warden approval")
    }

    const reason = String(body?.reason || "").trim()
    if (action !== CW_DECISION.APPROVE && !reason) {
      return badRequest("A reason is required")
    }

    request.currentStage = null
    request.stageDeadlineAt = null

    if (action === CW_DECISION.APPROVE) {
      request.approvals.push({
        stage: STAGE.CHIEF_WARDEN,
        action: ACCOMMODATION_ACTIONS.APPROVE,
        actorUserId: user._id,
        at: new Date(),
      })
      applyStatus(request, ACCOMMODATION_STATUS.CW_APPROVED, { by: user._id })
      notifyStaff(chiefWardenOfficeEmails, {
        heading: "The Chief Warden has approved a guest accommodation request.",
        action: "Set the amount and allot a hostel",
        request,
      })
    } else if (action === CW_DECISION.REQUEST_MODIFICATION) {
      request.approvals.push({
        stage: STAGE.CHIEF_WARDEN,
        action: ACCOMMODATION_ACTIONS.REQUEST_MODIFICATION,
        actorUserId: user._id,
        reason,
        at: new Date(),
      })
      applyStatus(request, ACCOMMODATION_STATUS.RETURNED_TO_STUDENT, { by: user._id, note: reason })
    } else {
      request.approvals.push({
        stage: STAGE.CHIEF_WARDEN,
        action: ACCOMMODATION_ACTIONS.REJECT,
        actorUserId: user._id,
        reason,
        at: new Date(),
      })
      applyStatus(request, ACCOMMODATION_STATUS.REJECTED, { by: user._id, note: reason })
    }

    await accommodationOwner.persist(request)
    accommodationEmails
      .sendStudentDecisionEmail({
        requestId: request._id,
        to: request.applicantEmail,
        studentName: request.applicantName,
        status: request.status,
        reason,
      })
      .catch(() => {})
    return success(request, 200, "Decision recorded")
  },

  // Chief Warden / CW Office skip the faculty-advisor stage and push the request
  // straight into Chief Warden approval (e.g. the advisor is unresponsive).
  async bypassFacultyAdvisor(requestId, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (request.status !== ACCOMMODATION_STATUS.PENDING_FA_RECOMMENDATION) {
      return badRequest("This request is not awaiting a faculty advisor recommendation")
    }

    await invalidateActionLinkTokens({ type: FA_TOKEN_TYPE, subjectId: request._id }, "bypassed").catch(() => {})
    request.approvals.push({
      stage: STAGE.FACULTY_ADVISOR,
      action: ACCOMMODATION_ACTIONS.BYPASS_FA,
      actorUserId: user._id,
      at: new Date(),
    })
    request.currentStage = STAGE.CHIEF_WARDEN
    request.stageDeadlineAt = cwDeadline()
    applyStatus(request, ACCOMMODATION_STATUS.PENDING_CW_APPROVAL, {
      by: user._id,
      note: "Faculty advisor bypassed",
    })
    await accommodationOwner.persist(request)
    notifyStaff(chiefWardenEmails, {
      heading: "A guest accommodation request skipped the faculty advisor and is waiting for your approval.",
      action: "Approve the request",
      request,
    })
    return success(request, 200, "Faculty advisor bypassed — request moved to Chief Warden approval")
  },

  // Sweeps requests whose Chief Warden window elapsed and auto-approves them.
  // Invoked by the lock-guarded hourly scheduler; safe to run on any instance.
  async autoApproveExpiredChiefWardenRequests() {
    const due = await accommodationQueries.findPendingCwApprovalDue()

    let count = 0
    for (const request of due) {
      request.approvals.push({
        stage: STAGE.CHIEF_WARDEN,
        action: ACCOMMODATION_ACTIONS.AUTO_APPROVE,
        actorUserId: null,
        reason: "Auto-approved: no Chief Warden response within the configured window",
        at: new Date(),
      })
      request.currentStage = null
      request.stageDeadlineAt = null
      applyStatus(request, ACCOMMODATION_STATUS.CW_APPROVED, { note: "Auto-approved (timeout)" })
      await accommodationOwner.persist(request)
      notifyStaff(chiefWardenOfficeEmails, {
        heading: `A guest accommodation request was auto-approved after ${CW_AUTO_APPROVE_HOURS} hours with no Chief Warden decision.`,
        action: "Set the amount and allot a hostel",
        request,
      })

      accommodationEmails
        .sendStudentDecisionEmail({
        requestId: request._id,
          to: request.applicantEmail,
          studentName: request.applicantName,
          status: request.status,
          reason: "",
        })
        .catch(() => {})
      count += 1
    }

    return count
  },

  // ---- Payment & allotment (Chief Warden Office + Accountant) ----

  // Chief Warden Office issues the payment request. This is also where the hostel
  // is chosen — the only point in the flow where allotment happens — so the beds
  // are committed the moment the student is asked to pay.
  // Amount comes from per-guest price + GST chosen here (presets from settings or manual).
  async issuePaymentRequest(requestId, body, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (request.status !== ACCOMMODATION_STATUS.CW_APPROVED) {
      return badRequest("This request is not approved and ready for a payment request")
    }

    const hostelId = body?.hostelId
    if (!hostelId) return badRequest("Select a hostel for the guests")
    const hostel = await hostelQueries.findHostelById(hostelId)
    if (!hostel) return notFound("Hostel not found")

    const guests = Array.isArray(request.guests) ? request.guests : []
    if (!guests.length) return badRequest("This request has no guests")

    const guestChargesInput = Array.isArray(body?.guestCharges) ? body.guestCharges : null
    if (!guestChargesInput || guestChargesInput.length !== guests.length) {
      return badRequest("Set price and GST for every guest")
    }

    const quote = buildQuoteFromGuestCharges({
      guests,
      nights: request.nights,
      guestCharges: guestChargesInput,
    })
    if (quote.error) return badRequest(quote.error)
    if (!(quote.total > 0)) return badRequest("Total amount must be greater than zero")

    const config = await getAccommodationConfig()
    const remarks = String(body?.remarks || "").trim()
    const finalAmount = quote.total

    /**
     * Availability is a read-then-write, and the write lands on *this* request's
     * document — two offices allotting the last room touch different documents,
     * so a transaction would not conflict and both would succeed. Serialising
     * per hostel is what actually prevents the oversell.
     */
    const claim = await withLockRetry(`lock:accommodation:allot:${hostelId}`, 30, async () => {
      const availability = await getHostelGuestAvailability({
        hostelId,
        from: request.stay.fromDate,
        to: request.stay.toDate,
        excludeRequestId: request._id,
      })
      // Rooms are given whole, so a booking is limited by free ROOMS first and
      // by beds within them second.
      const roomsNeeded = roomsNeededFor(request.persons, availability.largestRoom)
      if (availability.availableRooms < roomsNeeded) {
        return badRequest(
          `No guest rooms left at ${hostel.name} for these dates (this booking needs ${roomsNeeded}, ${availability.availableRooms} free)`
        )
      }
      if (availability.available < request.persons) {
        return badRequest(
          `Not enough beds at ${hostel.name} for these dates (need ${request.persons}, available ${availability.available})`
        )
      }

      request.quote = quote
      request.payment.amount = finalAmount
      // Payment link / QR always come from settings — no manual entry.
      request.payment.paymentLink = config?.defaultPaymentLink || ""
      request.payment.qrRef = config?.defaultPaymentQR || ""
      request.payment.remarks = remarks
      request.payment.status = PAYMENT_STATUS.PENDING
      request.payment.mode = null
      request.allotment = { hostelId, allottedBy: user._id, allottedAt: new Date() }
      request.currentStage = null
      request.stageDeadlineAt = null
      applyStatus(request, ACCOMMODATION_STATUS.PAYMENT_REQUESTED, {
        by: user._id,
        note: `Payment requested · allotted to ${hostel.name} · ${finalAmount}`,
      })
      await accommodationOwner.persist(request)
      return null
    })

    if (claim === LOCK_NOT_ACQUIRED) {
      return badRequest(`${hostel.name} is being allotted by someone else right now — please try again in a moment`)
    }
    if (claim) return claim // capacity check failed

    accommodationEmails
      .sendPaymentRequestEmail({
        to: request.applicantEmail,
        studentName: request.applicantName,
        amount: request.payment.amount,
        paymentLink: request.payment.paymentLink,
        hostelName: hostel.name,
        request,
      })
      .catch(() => {})
    return success(request, 200, "Payment requested and hostel allotted")
  },

  // Student opts to settle the bill later. Rooms stay unassigned until payment
  // is verified; the student may pay any time (including when the guest arrives).
  // Also covers a second payment after an approved extension/postpone charge.
  async deferPayment(requestId, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (!isOwner(request, user)) return forbidden("You do not have access to this request")

    // Additional (post-extension) bill when the initial payment is already verified.
    if (initialPaymentSettled(request)) {
      const addl = openAdditionalPayment(request)
      if (!addl || addl.status === PAYMENT_STATUS.DEFERRED) {
        return badRequest("No additional payment is open to defer")
      }
      if (![PAYMENT_STATUS.PENDING, PAYMENT_STATUS.REJECTED].includes(addl.status)) {
        return badRequest("This additional payment cannot be deferred right now")
      }
      addl.mode = PAYMENT_MODE.LATER
      addl.status = PAYMENT_STATUS.DEFERRED
      request.timeline.push({
        status: request.status,
        by: user._id,
        at: new Date(),
        note: `Additional payment deferred (${addl.label || "extra charge"})`,
      })
      await accommodationOwner.persist(request)
      return success(request, 200, "Additional payment deferred — you can pay any time.")
    }

    if (request.status !== ACCOMMODATION_STATUS.PAYMENT_REQUESTED) {
      return badRequest("Payment is not currently requested for this request")
    }

    request.payment.mode = PAYMENT_MODE.LATER
    request.payment.status = PAYMENT_STATUS.DEFERRED
    applyStatus(request, ACCOMMODATION_STATUS.PAYMENT_DEFERRED, {
      by: user._id,
      note: "Student chose to pay later",
    })
    await accommodationOwner.persist(request)
    return success(
      request,
      200,
      "Payment deferred — rooms will be allocated only after payment. You can pay any time."
    )
  },

  /**
   * Student submits proof of payment: UTR + the date they paid + a screenshot,
   * all three required. Works for:
   *  - pay now / pay later before rooms — PAYMENT_REQUESTED or PAYMENT_DEFERRED
   *    → PAYMENT_SUBMITTED (rooms wait for verification).
   *  - legacy deferred after rooms already assigned — only payment.status moves.
   *  - additional payment after an extension/postpone when initial bill is paid.
   */
  async submitPayment(requestId, body, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (!isOwner(request, user)) return forbidden("You do not have access to this request")

    const screenshotFileRef = String(body?.screenshotFileRef || "").trim()
    if (!screenshotFileRef) return badRequest("A payment screenshot is required")
    const utr = String(body?.utr || "").replace(/\s/g, "")
    if (!utr) return badRequest("UTR is required")
    if (!UTR_RE.test(utr)) return badRequest("UTR must be a 12-digit number")
    const paidAtRaw = body?.paidAt
    if (!paidAtRaw) return badRequest("Payment date is required")
    const paidAt = new Date(paidAtRaw)
    if (Number.isNaN(paidAt.getTime())) return badRequest("Payment date is invalid")
    if (paidAt.getTime() > Date.now()) return badRequest("Payment date cannot be in the future")

    // Second bill after extension/postpone (initial already verified).
    if (initialPaymentSettled(request)) {
      let addl = null
      if (body?.additionalPaymentId) {
        addl = (request.additionalPayments || []).id(body.additionalPaymentId)
      }
      if (!addl) addl = openAdditionalPayment(request)
      if (!addl) return badRequest("No additional payment is open for this request")
      if (![PAYMENT_STATUS.PENDING, PAYMENT_STATUS.DEFERRED, PAYMENT_STATUS.REJECTED].includes(addl.status)) {
        return badRequest("This additional payment is not open for submission")
      }
      addl.screenshotFileRef = screenshotFileRef
      addl.utr = utr
      addl.paidAt = paidAt
      addl.status = PAYMENT_STATUS.SUBMITTED
      addl.submittedAt = new Date()
      if (!addl.mode) addl.mode = PAYMENT_MODE.NOW
      request.timeline.push({
        status: request.status,
        by: user._id,
        at: new Date(),
        note: `Additional payment submitted (${addl.label || "extra charge"})`,
      })
      await accommodationOwner.persist(request)
      notifyStaff(accountantEmails, {
        heading: "A student has submitted proof for an additional accommodation payment.",
        action: "Verify the additional payment",
        request,
        extra: `<p>${addl.label || "Extra charge"} · UTR ${utr} · amount ${addl.amount}</p>`,
      })
      return success(request, 200, "Additional payment submitted for verification")
    }

    const paymentOpen =
      request.status === ACCOMMODATION_STATUS.PAYMENT_REQUESTED ||
      (request.status === ACCOMMODATION_STATUS.PAYMENT_DEFERRED &&
        [PAYMENT_STATUS.DEFERRED, PAYMENT_STATUS.REJECTED].includes(request.payment?.status))

    // Older bookings that got rooms before paying under the previous rules.
    const isLegacyDeferredSettlement =
      request.payment?.mode === PAYMENT_MODE.LATER &&
      DEFERRED_PAYABLE_STATUSES.includes(request.status) &&
      [PAYMENT_STATUS.DEFERRED, PAYMENT_STATUS.REJECTED].includes(request.payment?.status)

    if (!paymentOpen && !isLegacyDeferredSettlement) {
      return badRequest("Payment is not currently open for this request")
    }

    request.payment.screenshotFileRef = screenshotFileRef
    request.payment.utr = utr
    request.payment.paidAt = paidAt
    request.payment.status = PAYMENT_STATUS.SUBMITTED
    request.payment.submittedAt = new Date()
    if (isLegacyDeferredSettlement) {
      request.timeline.push({
        status: request.status,
        by: user._id,
        at: new Date(),
        note: "Deferred payment submitted",
      })
    } else {
      // Paying from the initial request is "now"; from deferred keeps mode "later".
      if (request.status === ACCOMMODATION_STATUS.PAYMENT_REQUESTED) {
        request.payment.mode = PAYMENT_MODE.NOW
      }
      applyStatus(request, ACCOMMODATION_STATUS.PAYMENT_SUBMITTED, { by: user._id, note: "Payment submitted" })
    }
    await accommodationOwner.persist(request)

    accommodationEmails
      .sendStudentDecisionEmail({
        requestId: request._id,
        to: request.applicantEmail,
        studentName: request.applicantName,
        status: request.status,
        reason: "Your payment is awaiting verification.",
      })
      .catch(() => {})
    notifyStaff(accountantEmails, {
      heading: `A student has submitted proof of payment${isLegacyDeferredSettlement ? " for a deferred bill" : ""}.`,
      action: "Verify the payment",
      request,
      extra: `<p>UTR ${request.payment.utr} · amount ${request.payment.amount}</p>`,
    })
    return success(request, 200, "Payment submitted for verification")
  },

  /**
   * Accountant verifies (or rejects) the submitted payment. After verification
   * the supervisor can assign rooms. A legacy deferred bill paid after rooms
   * were already assigned only updates payment.status and issues the invoice.
   * Optional body.utr / body.paidAt correct the student's entry before verify.
   * body.additionalPaymentId targets a second (extension) payment when set.
   */
  async verifyPayment(requestId, action, body, user) {
    if (![PAYMENT_DECISION.VERIFY, PAYMENT_DECISION.REJECT].includes(action)) {
      return badRequest("Invalid action")
    }
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")

    // Prefer explicit additional payment id; else any submitted additional bill.
    let addl = null
    if (body?.additionalPaymentId) {
      addl = (request.additionalPayments || []).id(body.additionalPaymentId)
      if (!addl) return notFound("Additional payment not found")
    } else if (request.payment?.status !== PAYMENT_STATUS.SUBMITTED) {
      addl = submittedAdditionalPayment(request)
    }

    if (addl) {
      if (addl.status !== PAYMENT_STATUS.SUBMITTED) {
        return badRequest("This additional payment is not awaiting verification")
      }
      const wantsUtr = body?.utr != null && String(body.utr).trim() !== ""
      const wantsPaidAt = body?.paidAt != null && String(body.paidAt).trim() !== ""
      if (wantsUtr || wantsPaidAt) {
        const parsed = parsePaymentDetails({
          utr: wantsUtr ? body.utr : undefined,
          paidAt: wantsPaidAt ? body.paidAt : undefined,
        })
        if (parsed.error) return badRequest(parsed.error)
        if (parsed.hasUtr) addl.utr = parsed.utr
        if (parsed.hasPaidAt) addl.paidAt = parsed.paidAt
      }
      const note = String(body?.note || "").trim()
      if (action === PAYMENT_DECISION.VERIFY) {
        addl.status = PAYMENT_STATUS.VERIFIED
        addl.verifiedBy = user._id
        addl.verifiedAt = new Date()
        addl.note = note
        request.timeline.push({
          status: request.status,
          by: user._id,
          at: new Date(),
          note: `Additional payment verified (${addl.label || "extra charge"})`,
        })
      } else {
        if (!note) return badRequest("A reason is required to reject the payment")
        addl.status = PAYMENT_STATUS.REJECTED
        addl.note = note
        request.timeline.push({
          status: request.status,
          by: user._id,
          at: new Date(),
          note: `Additional payment rejected: ${note}`,
        })
      }
      await accommodationOwner.persist(request)
      accommodationEmails
        .sendStudentDecisionEmail({
          requestId: request._id,
          to: request.applicantEmail,
          studentName: request.applicantName,
          status: action === PAYMENT_DECISION.VERIFY ? "Additional payment verified" : "Additional payment rejected",
          reason: note,
        })
        .catch(() => {})
      return success(
        request,
        200,
        action === PAYMENT_DECISION.VERIFY ? "Additional payment verified" : "Additional payment rejected"
      )
    }

    if (request.payment?.status !== PAYMENT_STATUS.SUBMITTED) {
      return badRequest("No payment is awaiting verification for this request")
    }
    // Workflow still at PAYMENT_SUBMITTED → normal path. Anything else is a
    // legacy deferred settlement after the stay has already moved on.
    const isLegacyDeferredSettlement = request.status !== ACCOMMODATION_STATUS.PAYMENT_SUBMITTED

    // Optional corrections to the uploaded proof (typos) before verifying.
    const wantsUtr = body?.utr != null && String(body.utr).trim() !== ""
    const wantsPaidAt = body?.paidAt != null && String(body.paidAt).trim() !== ""
    if (wantsUtr || wantsPaidAt) {
      const parsed = parsePaymentDetails({
        utr: wantsUtr ? body.utr : undefined,
        paidAt: wantsPaidAt ? body.paidAt : undefined,
      })
      if (parsed.error) return badRequest(parsed.error)
      if (parsed.hasUtr) request.payment.utr = parsed.utr
      if (parsed.hasPaidAt) request.payment.paidAt = parsed.paidAt
    }

    const note = String(body?.note || "").trim()
    if (action === PAYMENT_DECISION.VERIFY) {
      request.payment.status = PAYMENT_STATUS.VERIFIED
      request.payment.verifiedBy = user._id
      request.payment.verifiedAt = new Date()
      request.payment.note = note
      if (isLegacyDeferredSettlement) {
        request.timeline.push({
          status: request.status,
          by: user._id,
          at: new Date(),
          note: "Deferred payment verified",
        })
      } else {
        applyStatus(request, ACCOMMODATION_STATUS.PAYMENT_VERIFIED, { by: user._id, note: "Payment verified" })
        notifySupervisorReadyForRooms(request)
      }
    } else {
      if (!note) return badRequest("A reason is required to reject the payment")
      request.payment.status = PAYMENT_STATUS.REJECTED
      request.payment.note = note
      if (isLegacyDeferredSettlement) {
        request.timeline.push({
          status: request.status,
          by: user._id,
          at: new Date(),
          note: `Deferred payment rejected: ${note}`,
        })
      } else {
        // Restore the path they came from so pay-later stays deferred.
        const backTo =
          request.payment.mode === PAYMENT_MODE.LATER
            ? ACCOMMODATION_STATUS.PAYMENT_DEFERRED
            : ACCOMMODATION_STATUS.PAYMENT_REQUESTED
        applyStatus(request, backTo, { by: user._id, note })
      }
    }
    await accommodationOwner.persist(request)

    if (isLegacyDeferredSettlement && action === PAYMENT_DECISION.VERIFY) {
      await this._issueInvoice(request).catch(() => {})
    }

    accommodationEmails
      .sendStudentDecisionEmail({
        requestId: request._id,
        to: request.applicantEmail,
        studentName: request.applicantName,
        status: action === PAYMENT_DECISION.VERIFY ? "Payment Verified" : "Payment Rejected",
        reason: note,
      })
      .catch(() => {})
    return success(request, 200, action === PAYMENT_DECISION.VERIFY ? "Payment verified" : "Payment rejected")
  },

  // ---- Stay date changes (postpone / extend) ----

  /**
   * Student requests to postpone the stay (new from + to) or extend the end date.
   * Limits: 1 postpone and 2 extension requests per booking (any status counts).
   */
  async requestScheduleChange(requestId, body, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (!isOwner(request, user)) return forbidden("You do not have access to this request")
    if (!SCHEDULE_CHANGE_ELIGIBLE.includes(request.status)) {
      return badRequest("Stay dates can only be changed after the request is approved and before checkout")
    }
    if ((request.scheduleChanges || []).some((c) => c.status === SCHEDULE_CHANGE_STATUS.PENDING)) {
      return badRequest("A date-change request is already pending for this booking")
    }

    const type = String(body?.type || "").trim()
    if (![SCHEDULE_CHANGE_TYPE.POSTPONE, SCHEDULE_CHANGE_TYPE.EXTEND].includes(type)) {
      return badRequest("Type must be postpone or extend")
    }
    const used = (request.scheduleChanges || []).filter((c) => c.type === type).length
    const limit = SCHEDULE_LIMITS[type] ?? 0
    if (used >= limit) {
      return badRequest(
        type === SCHEDULE_CHANGE_TYPE.POSTPONE
          ? "Only one postponement request is allowed per booking"
          : "Only two extension requests are allowed per booking"
      )
    }

    const currentFrom = request.stay?.fromDate
    const currentTo = request.stay?.toDate
    if (!currentFrom || !currentTo) return badRequest("This booking has no stay dates")

    const reason = String(body?.reason || "").trim()
    if (!reason) return badRequest("Please explain why you need this change")

    let requestedFromDate = currentFrom
    let requestedToDate = parseStayDate(body?.toDate)
    if (!requestedToDate) return badRequest("A new end date is required")

    if (type === SCHEDULE_CHANGE_TYPE.POSTPONE) {
      requestedFromDate = parseStayDate(body?.fromDate)
      if (!requestedFromDate) return badRequest("A new start date is required to postpone")
      if (requestedToDate.getTime() <= requestedFromDate.getTime()) {
        return badRequest("End date must be after start date")
      }
      if (dayKey(requestedFromDate) === dayKey(currentFrom) && dayKey(requestedToDate) === dayKey(currentTo)) {
        return badRequest("New dates are the same as the current stay")
      }
    } else {
      // Extension: end date must move later; start stays fixed.
      if (dayKey(requestedToDate) <= dayKey(currentTo)) {
        return badRequest("Extension end date must be after the current check-out date")
      }
      requestedFromDate = currentFrom
    }

    request.scheduleChanges = request.scheduleChanges || []
    request.scheduleChanges.push({
      type,
      status: SCHEDULE_CHANGE_STATUS.PENDING,
      requestedFromDate,
      requestedToDate,
      previousFromDate: currentFrom,
      previousToDate: currentTo,
      reason,
      requestedAt: new Date(),
    })
    request.timeline.push({
      status: request.status,
      by: user._id,
      at: new Date(),
      note:
        type === SCHEDULE_CHANGE_TYPE.POSTPONE
          ? `Postponement requested → ${dayKey(requestedFromDate)} to ${dayKey(requestedToDate)}`
          : `Extension requested → end ${dayKey(requestedToDate)}`,
    })
    await accommodationOwner.persist(request)

    notifyStaff(chiefWardenOfficeEmails, {
      heading:
        type === SCHEDULE_CHANGE_TYPE.POSTPONE
          ? "A student requested to postpone guest accommodation dates."
          : "A student requested to extend the guest stay end date.",
      action: "Review date change",
      request,
      extra: `<p>Requested: ${dayKey(requestedFromDate)} → ${dayKey(requestedToDate)}. Reason: ${reason}</p>`,
    })
    return success(request, 200, "Date-change request submitted to Chief Warden Office")
  },

  /**
   * Chief Warden Office approves or rejects a postpone/extend request.
   * On approve: applies dates, rechecks hostel capacity if allotted, and may
   * add extra amount — folded into the open bill if unpaid, else a second payment.
   * body: { action: approve|reject, note?, extraAmount? }
   */
  async decideScheduleChange(requestId, changeId, body, user) {
    const action = String(body?.action || "").trim()
    if (![SCHEDULE_DECISION.APPROVE, SCHEDULE_DECISION.REJECT].includes(action)) {
      return badRequest("Invalid action")
    }
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")

    const change = (request.scheduleChanges || []).id(changeId)
    if (!change) return notFound("Date-change request not found")
    if (change.status !== SCHEDULE_CHANGE_STATUS.PENDING) {
      return badRequest("This date-change request has already been decided")
    }

    const note = String(body?.note || "").trim()
    if (action === SCHEDULE_DECISION.REJECT) {
      if (!note) return badRequest("A reason is required to reject the request")
      change.status = SCHEDULE_CHANGE_STATUS.REJECTED
      change.decisionNote = note
      change.decidedAt = new Date()
      change.decidedBy = user._id
      request.timeline.push({
        status: request.status,
        by: user._id,
        at: new Date(),
        note: `${change.type === SCHEDULE_CHANGE_TYPE.POSTPONE ? "Postponement" : "Extension"} rejected: ${note}`,
      })
      await accommodationOwner.persist(request)
      accommodationEmails
        .sendStudentDecisionEmail({
          requestId: request._id,
          to: request.applicantEmail,
          studentName: request.applicantName,
          status: change.type === SCHEDULE_CHANGE_TYPE.POSTPONE ? "Postponement rejected" : "Extension rejected",
          reason: note,
        })
        .catch(() => {})
      return success(request, 200, "Date-change request rejected")
    }

    const newFrom = change.requestedFromDate
    const newTo = change.requestedToDate
    if (!newFrom || !newTo) return badRequest("Invalid requested dates on this change")

    let extraAmount = ROUND2(body?.extraAmount)
    if (Number.isNaN(extraAmount) || extraAmount < 0) return badRequest("Extra amount is invalid")
    if (!paymentStepPassed(request)) {
      // Amount not set yet — no extra charge path; dates only.
      extraAmount = 0
    }

    // Capacity for the new window when a hostel is already allotted.
    if (request.allotment?.hostelId) {
      const hostelId = request.allotment.hostelId
      const claim = await withLockRetry(`lock:accommodation:allot:${hostelId}`, 30, async () => {
        const availability = await getHostelGuestAvailability({
          hostelId,
          from: newFrom,
          to: newTo,
          excludeRequestId: request._id,
        })
        const roomsNeeded = roomsNeededFor(request.persons, availability.largestRoom)
        if (availability.availableRooms < roomsNeeded) {
          return badRequest(
            `Not enough guest rooms free for the new dates (need ${roomsNeeded}, ${availability.availableRooms} free)`
          )
        }
        if (availability.available < request.persons) {
          return badRequest(
            `Not enough beds free for the new dates (need ${request.persons}, available ${availability.available})`
          )
        }
        return null
      })
      if (claim === LOCK_NOT_ACQUIRED) {
        return badRequest("This hostel is being updated right now — try again in a moment")
      }
      if (claim) return claim
    }

    // Apply new dates.
    request.stay.fromDate = newFrom
    request.stay.toDate = newTo
    request.nights = computeNights(newFrom, newTo)
    if (request.quote) {
      request.quote.nights = request.nights
      request.quote.persons = request.persons
    }

    change.status = SCHEDULE_CHANGE_STATUS.APPROVED
    change.extraAmount = extraAmount
    change.decisionNote = note
    change.decidedAt = new Date()
    change.decidedBy = user._id

    let paymentMessage = ""
    if (extraAmount > 0) {
      if (!initialPaymentSettled(request)) {
        // Unpaid (or not yet verified): student pays the combined total once.
        request.payment.amount = ROUND2((Number(request.payment.amount) || 0) + extraAmount)
        if (request.quote) {
          request.quote.total = ROUND2((Number(request.quote.total) || 0) + extraAmount)
          request.quote.subtotal = ROUND2((Number(request.quote.subtotal) || 0) + extraAmount)
        }
        if (request.payment.remarks) {
          request.payment.remarks = `${request.payment.remarks} · +${extraAmount} for ${change.type}`
        } else {
          request.payment.remarks = `Includes +${extraAmount} for ${change.type}`
        }
        paymentMessage = ` Extra ₹${extraAmount} added to the open bill (pay once for the full amount).`
      } else {
        // Already paid: open a second payment with the same portal process.
        const config = await getAccommodationConfig()
        const label =
          change.type === SCHEDULE_CHANGE_TYPE.POSTPONE ? "Postponement charge" : "Extension charge"
        request.additionalPayments = request.additionalPayments || []
        request.additionalPayments.push({
          amount: extraAmount,
          status: PAYMENT_STATUS.PENDING,
          mode: null,
          label,
          scheduleChangeId: change._id,
          remarks: note || label,
        })
        paymentMessage = ` A second payment of ₹${extraAmount} has been requested.`
        accommodationEmails
          .sendPaymentRequestEmail({
            to: request.applicantEmail,
            studentName: request.applicantName,
            amount: extraAmount,
            paymentLink: request.payment?.paymentLink || config?.defaultPaymentLink || "",
            hostelName: "",
            request,
          })
          .catch(() => {})
      }
    }

    request.timeline.push({
      status: request.status,
      by: user._id,
      at: new Date(),
      note: `${change.type === SCHEDULE_CHANGE_TYPE.POSTPONE ? "Postponement" : "Extension"} approved → ${dayKey(newFrom)} to ${dayKey(newTo)}${extraAmount > 0 ? ` · extra ₹${extraAmount}` : ""}`,
    })
    await accommodationOwner.persist(request)

    accommodationEmails
      .sendStudentDecisionEmail({
        requestId: request._id,
        to: request.applicantEmail,
        studentName: request.applicantName,
        status: change.type === SCHEDULE_CHANGE_TYPE.POSTPONE ? "Postponement approved" : "Extension approved",
        reason: `${note || "Approved."}${paymentMessage} New stay: ${dayKey(newFrom)} to ${dayKey(newTo)}.`,
      })
      .catch(() => {})

    return success(request, 200, `Date change approved.${paymentMessage}`)
  },

  /**
   * Accountant corrects UTR and/or payment date after proof is submitted or
   * verified (typos, bank statement reconciliation). Does not change status.
   */
  async updatePaymentDetails(requestId, body, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (!request.payment?.amount) {
      return badRequest("No payment has been requested for this request yet")
    }
    if (![PAYMENT_STATUS.SUBMITTED, PAYMENT_STATUS.VERIFIED].includes(request.payment.status)) {
      return badRequest("Payment details can only be edited after proof is submitted or the bill is marked paid")
    }

    const parsed = parsePaymentDetails(body)
    if (parsed.error) return badRequest(parsed.error)

    const changes = []
    if (parsed.hasUtr) {
      request.payment.utr = parsed.utr
      changes.push(`UTR ${parsed.utr}`)
    }
    if (parsed.hasPaidAt) {
      request.payment.paidAt = parsed.paidAt
      changes.push(`paid on ${parsed.paidAt.toISOString().slice(0, 10)}`)
    }

    request.timeline.push({
      status: request.status,
      by: user._id,
      at: new Date(),
      note: `Payment details updated: ${changes.join(", ")}`,
    })
    await accommodationOwner.persist(request)
    return success(request, 200, "Payment details updated")
  },

  /**
   * Generate + email the GST invoice for a request whose payment is settled.
   * Does not touch the workflow status — closing the stay is the sweep's job.
   * No-ops if an invoice already exists.
   */
  async _issueInvoice(request) {
    if (request.invoice?.generatedAt) return request
    const config = await getAccommodationConfig()
    const generatedAt = new Date()
    // GST invoices must run in an unbroken consecutive series per financial
    // year, so the serial comes from an atomic counter — not the request id.
    const seriesKey = buildInvoiceNumber({ serial: null, date: generatedAt }).replace(/\/[^/]*$/, "")
    const serial = await accommodationOwner.nextInvoiceSerial(seriesKey)
    const number = buildInvoiceNumber({ serial, date: generatedAt })
    request.invoice = {
      number,
      pdfFileRef: "",
      gstApplicable: (request.quote?.gstPercentage || 0) > 0,
      generatedAt,
      emailedAt: null,
    }
    await accommodationOwner.persist(request)

    const hostel = request.allotment?.hostelId
      ? await hostelQueries.findHostelById(request.allotment.hostelId)
      : null

    // Render the HCU invoice sheet, then stash it so it can be re-downloaded
    // later. A storage failure must not cost the student their invoice email,
    // so the bytes are kept in memory for the attachment either way.
    let pdf = null
    try {
      pdf = await renderInvoicePdf(
        buildInvoiceModel({
          request,
          hostelName: hostel?.name || "",
          gstin: config?.gstin || "",
          studentName: request.applicantName,
        })
      )
      const stored = await storageClient.upload({
        file: { buffer: pdf, mimetype: "application/pdf", originalname: `${number.replace(/[^\w-]+/g, "-")}.pdf` },
        policy: "certificate",
        actorId: request.requesterUserId,
        actorRole: "System",
        sourceService: "accommodation",
        entityHint: String(request._id),
      })
      const fileRef = stored?.fileRef || stored?.data?.fileRef || ""
      if (fileRef) {
        request.invoice.pdfFileRef = fileRef
        await accommodationOwner.persist(request)
      }
    } catch (error) {
      console.error("Accommodation invoice PDF failed:", error.message)
    }

    try {
      await accommodationEmails.sendInvoiceEmail({
        to: request.applicantEmail,
        studentName: request.applicantName,
        number,
        quote: request.quote,
        gstin: config?.gstin,
        hostelName: hostel?.name,
        request,
        pdf,
      })
      request.invoice.emailedAt = new Date()
      await accommodationOwner.persist(request)
    } catch {
      // email failure shouldn't block invoicing
    }
    return request
  },

  // ---- Arrival tail (Hostel Supervisor / Guest House Manager + Gate) ----

  // CW Office view: per-hostel guest-bed availability for the requested dates.
  // Backs both the capacity screening and the hostel pick at payment time.
  // Also returns price/GST presets for the per-guest charge form.
  async getAllotmentAvailability(requestId) {
    const request = await accommodationQueries.findRequestByIdLean(requestId)
    if (!request) return notFound("Accommodation request not found")
    const hostels = await listHostelsGuestAvailability({
      from: request.stay?.fromDate,
      to: request.stay?.toDate,
      excludeRequestId: requestId,
    })
    const config = await getAccommodationConfig()
    return success({
      stay: request.stay,
      persons: request.persons,
      hostels,
      pricing: {
        priceOptions: priceOptionsFromConfig(config),
        gstOptions: gstOptionsFromConfig(config),
      },
    })
  },

  // Supervisor assignment view: per-room free beds in the allotted hostel.
  async getRoomAvailability(requestId) {
    const request = await accommodationQueries.findRequestByIdLean(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (!request.allotment?.hostelId) return badRequest("A hostel has not been allotted yet")
    const rooms = await getGuestRoomAvailability({
      hostelId: request.allotment.hostelId,
      includeRoomIds: (request.rooms || []).map((r) => r.roomId),
    })
    return success({ stay: request.stay, persons: request.persons, rooms })
  },

  // Supervisor assigns specific guest rooms/beds (mandatory step). Reached only
  // after payment is verified (pay-later also waits for payment first).
  async assignRooms(requestId, body, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    const assignable = [
      ACCOMMODATION_STATUS.PAYMENT_VERIFIED,
      ACCOMMODATION_STATUS.HOSTEL_ALLOTTED, // legacy in-flight requests
      ACCOMMODATION_STATUS.ROOMS_ASSIGNED, // reassignment
    ]
    if (!assignable.includes(request.status)) {
      return badRequest(
        request.status === ACCOMMODATION_STATUS.PAYMENT_DEFERRED
          ? "Rooms can be assigned only after payment is verified"
          : "This request is not ready for room assignment"
      )
    }
    const hostelId = request.allotment?.hostelId
    if (!hostelId) return badRequest("A hostel has not been allotted yet")

    const assignments = Array.isArray(body?.rooms) ? body.rooms : []
    if (assignments.length === 0) return badRequest("At least one room assignment is required")

    const persons = request.persons || (request.guests?.length || 0)
    const allIndexes = []
    for (const assignment of assignments) {
      if (!assignment?.roomId) return badRequest("Each assignment needs a roomId")
      const indexes = Array.isArray(assignment.guestIndexes) ? assignment.guestIndexes : []
      if (indexes.length === 0) return badRequest("Each room needs at least one guest")
      for (const index of indexes) {
        if (!Number.isInteger(index) || index < 0 || index >= persons) {
          return badRequest("Invalid guest index in assignment")
        }
        allIndexes.push(index)
      }
    }
    const uniqueIndexes = new Set(allIndexes)
    if (uniqueIndexes.size !== allIndexes.length) return badRequest("A guest is assigned to more than one room")
    if (uniqueIndexes.size !== persons) return badRequest("Every guest must be assigned to exactly one room")

    // Valid rooms = fully-empty Active rooms in the hostel, plus the ones this
    // booking already holds (so a reassignment can keep them).
    const prevRoomIds = new Set((request.rooms || []).map((r) => String(r.roomId)))
    const availability = await getGuestRoomAvailability({ hostelId, includeRoomIds: [...prevRoomIds] })
    const availById = new Map(availability.map((r) => [String(r.roomId), r]))
    for (const assignment of assignments) {
      const info = availById.get(String(assignment.roomId))
      if (!info) return badRequest("One or more selected rooms are no longer available")
      const need = assignment.guestIndexes.length
      if (need > info.available) {
        const label = `${info.unitNumber ? `${info.unitNumber}-` : ""}${info.roomNumber}`
        return badRequest(`Room ${label} has only ${info.available} bed(s)`)
      }
    }

    request.rooms = assignments.map((a) => ({ roomId: a.roomId, guestIndexes: a.guestIndexes }))
    request.roomsAssignedBy = user._id
    request.roomsAssignedAt = new Date()
    if (request.status !== ACCOMMODATION_STATUS.ROOMS_ASSIGNED) {
      applyStatus(request, ACCOMMODATION_STATUS.ROOMS_ASSIGNED, { by: user._id, note: "Rooms assigned" })
    } else {
      request.timeline.push({
        status: ACCOMMODATION_STATUS.ROOMS_ASSIGNED,
        by: user._id,
        at: new Date(),
        note: "Rooms re-assigned",
      })
    }
    await accommodationOwner.persist(request)

    // Flip the newly-held rooms to "Guest" and release any dropped on reassignment.
    const newRoomIds = new Set(assignments.map((a) => String(a.roomId)))
    const toHold = [...newRoomIds].filter((id) => !prevRoomIds.has(id))
    const toRelease = [...prevRoomIds].filter((id) => !newRoomIds.has(id))
    // Atomic guest holds/releases via the room owner (no capacity-clobbering RMW).
    // Best-effort as before: a flip failure must not fail the already-saved request.
    try {
      await roomOwner.holdRoomsForGuest(toHold)
      await roomOwner.releaseRooms(toRelease)
    } catch (err) {
      console.error("Guest room flip failed:", err.message)
    }

    const hostel = await hostelQueries.findHostelById(hostelId)
    accommodationEmails
      .sendRoomsAssignedEmail({
        to: request.applicantEmail,
        studentName: request.applicantName,
        hostelName: hostel?.name,
        request,
      })
      .catch(() => {})
    return success(request, 200, "Rooms assigned")
  },

  async checkIn(requestId, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (request.status !== ACCOMMODATION_STATUS.ROOMS_ASSIGNED) {
      return badRequest("Guests can be checked in only after rooms are assigned")
    }
    request.checkInAt = new Date()
    applyStatus(request, ACCOMMODATION_STATUS.CHECKED_IN, { by: user._id, note: "Checked in" })
    await accommodationOwner.persist(request)
    return success(request, 200, "Guests checked in")
  },

  async checkOut(requestId, user) {
    const request = await accommodationQueries.findRequestById(requestId)
    if (!request) return notFound("Accommodation request not found")
    if (request.status !== ACCOMMODATION_STATUS.CHECKED_IN) {
      return badRequest("Guests must be checked in before checking out")
    }
    request.checkOutAt = new Date()
    applyStatus(request, ACCOMMODATION_STATUS.CHECKED_OUT, { by: user._id, note: "Checked out" })
    await accommodationOwner.persist(request)
    return success(request, 200, "Guests checked out")
  },

  /**
   * Nightly sweep: close out stays that have ended (gate check-out optional).
   * The invoice is a receipt, so it is only produced for a settled payment — an
   * unpaid "pay later" booking is still closed and its rooms released, and gets
   * its invoice later, when the accountant verifies the payment.
   * Allotted-but-never-assigned requests are intentionally skipped.
   */
  async generateStayEndInvoices() {
    const due = await accommodationQueries.findDueForStayClose()

    let count = 0
    for (const request of due) {
      if (request.payment?.status === PAYMENT_STATUS.VERIFIED) {
        await this._issueInvoice(request)
      }
      applyStatus(request, ACCOMMODATION_STATUS.INVOICED, {
        note: request.invoice?.generatedAt ? "Invoice generated" : "Stay closed — payment outstanding",
      })
      await accommodationOwner.persist(request)

      // Release the guest rooms back to the normal Active pool (atomic).
      await roomOwner
        .releaseRooms((request.rooms || []).map((r) => r.roomId))
        .catch(() => {})

      count += 1
    }
    return count
  },

  // ---- Faculty advisor (public, token-based) ----

  async getRecommendationByToken(rawToken) {
    const tokenDoc = await findActionLinkTokenByRawToken(rawToken, { type: FA_TOKEN_TYPE })
    if (!tokenDoc) return notFound("Invalid or already-used recommendation link")
    if (isActionLinkTokenExpired(tokenDoc)) return badRequest("This recommendation link has expired")

    const request = await accommodationQueries.findRequestByIdLean(tokenDoc.subjectId)
    if (!request) return notFound("Request not found")

    const student = await buildStudentSummary(request.requesterUserId)

    return success({
      alreadyHandled: request.status !== ACCOMMODATION_STATUS.PENDING_FA_RECOMMENDATION,
      student,
      request: {
        applicantName: request.applicantName,
        applicantPhone: request.applicantPhone,
        applicantEmail: request.applicantEmail,
        persons: request.persons,
        nights: request.nights,
        guests: (request.guests || []).map((g) => ({
          name: g.name,
          gender: g.gender,
          age: g.age,
          relation: g.relation,
        })),
        stay: request.stay,
        roomPreference: request.roomPreference || null,
        status: request.status,
      },
    })
  },

  async submitRecommendation(rawToken, body) {
    const decision = body?.decision
    if (![FA_DECISION.RECOMMEND, FA_DECISION.DECLINE].includes(decision)) {
      return badRequest("Invalid decision")
    }

    const tokenDoc = await findActionLinkTokenByRawToken(rawToken, { type: FA_TOKEN_TYPE })
    if (!tokenDoc) return notFound("Invalid or already-used recommendation link")
    if (isActionLinkTokenExpired(tokenDoc)) return badRequest("This recommendation link has expired")

    const request = await accommodationQueries.findRequestById(tokenDoc.subjectId)
    if (!request) return notFound("Request not found")
    if (request.status !== ACCOMMODATION_STATUS.PENDING_FA_RECOMMENDATION) {
      return badRequest("This request has already been processed")
    }

    const reason = String(body?.reason || "").trim()
    const actorEmail = tokenDoc.recipientEmail

    if (decision === FA_DECISION.RECOMMEND) {
      request.approvals.push({
        stage: STAGE.FACULTY_ADVISOR,
        action: ACCOMMODATION_ACTIONS.RECOMMEND,
        actorEmail,
        reason: reason || null,
        at: new Date(),
      })
      request.currentStage = STAGE.CHIEF_WARDEN
      request.stageDeadlineAt = cwDeadline()
      applyStatus(request, ACCOMMODATION_STATUS.PENDING_CW_APPROVAL, {
        note: "Recommended by faculty advisor",
      })
      notifyStaff(chiefWardenEmails, {
        heading: "A faculty advisor has recommended a guest accommodation request.",
        action: "Approve the request",
        request,
      })
    } else {
      request.approvals.push({
        stage: STAGE.FACULTY_ADVISOR,
        action: ACCOMMODATION_ACTIONS.REQUEST_MODIFICATION,
        actorEmail,
        reason: reason || null,
        at: new Date(),
      })
      request.currentStage = null
      request.stageDeadlineAt = null
      applyStatus(request, ACCOMMODATION_STATUS.RETURNED_TO_STUDENT, {
        note: reason || "Not recommended by faculty advisor",
      })
    }

    await accommodationOwner.persist(request)
    await consumeActionLinkToken(tokenDoc, { decision, reason })
    accommodationEmails
      .sendStudentDecisionEmail({
        requestId: request._id,
        to: request.applicantEmail,
        studentName: request.applicantName,
        status: request.status,
        reason,
      })
      .catch(() => {})

    return success({ status: request.status }, 200, "Recommendation recorded")
  },
}

export default accommodationService
