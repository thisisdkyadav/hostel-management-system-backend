import { success, badRequest, forbidden, notFound } from "../../../../services/base/index.js"
import { accommodationQueries as queries } from "../../../../services/accommodation/accommodationQueries.service.js"
import { hostelQueries } from "../../../../services/hostel/hostelQueries.service.js"
import { buildQuoteFromGuestCharges, getAccommodationConfig } from "../accommodation/accommodation.quote.js"
import {
  S,
  validId,
  isCreator,
  isOffice,
  isAccounts,
  isFaculty,
  isClosed,
  paid,
  audit,
  mutate,
  clean,
  parsePaidAt,
} from "./h4.helpers.js"
import { h4Notifications } from "./h4.notifications.js"
import { h4Service } from "./h4.service.js"

const canPay = (r, u) => u.external === "payer" || isCreator(r, u) || (isFaculty(r, u) && r.h4.payer.type === "faculty")
const openPayment = (r, body) =>
  body.additionalPaymentId ? r.additionalPayments.id(body.additionalPaymentId) : r.payment
const notify = async (result) => {
  if (result.success) await h4Notifications.handoff(result.data)
  return result
}
export const h4Payments = {
  async offer(id, body, user) {
    const config = await getAccommodationConfig()
    const result = await mutate(id, body, user, async (r, u, session) => {
      if (!isOffice(u)) return forbidden()
      if (r.status !== S.CW_APPROVED || !r.h4.payer.verifiedAt)
        return badRequest("Chief Warden approval and faculty payer confirmation are required")
      if (!validId(body.hostelId)) return badRequest("Select the allotted hostel")
      const hostel = await hostelQueries.findHostelById(body.hostelId, { session })
      if (!hostel || hostel.isArchived) return badRequest("Select an active hostel")
      if (!["with", "without"].includes(body.mess)) return badRequest("Choose with or without mess")
      const paymentLink = clean(body.paymentLink, 2048)
      if (paymentLink) {
        try {
          if (!["http:", "https:"].includes(new URL(paymentLink).protocol))
            return badRequest("Enter a valid payment portal URL")
        } catch {
          return badRequest("Enter a valid payment portal URL")
        }
      }
      if (body.price === "" || body.price == null || body.gstPercentage == null || body.gstPercentage === "")
        return badRequest("Enter accommodation price and GST")
      if (
        Number(body.price) > 10000000 ||
        !Number.isFinite(Number(body.gstPercentage)) ||
        Number(body.gstPercentage) < 0 ||
        Number(body.gstPercentage) > 100
      )
        return badRequest("Enter a valid price and GST percentage")
      const quote = buildQuoteFromGuestCharges({
        guests: r.guests,
        nights: r.nights,
        guestCharges: [{ guestIndex: 0, price: body.price, gstPercentage: body.gstPercentage }],
      })
      if (quote.error) return badRequest(quote.error)
      if (quote.total === 0 && !clean(body.reason))
        return badRequest("Enter a reason for waiving accommodation charges")
      r.quote = quote
      r.h4.mess = body.mess
      r.allotment = { hostelId: hostel._id, allottedBy: u._id, allottedAt: new Date() }
      r.guestAllotments = [{ guestIndex: 0, hostelId: hostel._id }]
      r.payment = {
        amount: quote.total,
        status: quote.total === 0 ? "Verified" : "Pending",
        qrRef: config.defaultPaymentQR,
        paymentLink,
        remarks: clean(body.remarks, 1000),
        verifiedBy: quote.total === 0 ? u._id : null,
        verifiedAt: quote.total === 0 ? new Date() : null,
      }
      r.currentStage = null
      audit(
        r,
        u,
        quote.total === 0
          ? `Accommodation charge waived: ${clean(body.reason)}`
          : "Hostel, mess and accommodation charges issued to intern and payer",
        quote.total === 0 ? S.PAYMENT_VERIFIED : S.PAYMENT_REQUESTED,
      )
    })
    return notify(result)
  },
  async submit(id, body, user) {
    const result = await mutate(id, body, user, (r, u) => {
      if (!canPay(r, u)) return forbidden()
      if ([S.REJECTED, S.CANCELLED, S.INVOICED].includes(r.status) || r.h4.amendment?.stage)
        return badRequest("This request cannot accept payment proof now")
      const payment = openPayment(r, body)
      if (!payment || !["Pending", "Deferred", "Rejected"].includes(payment.status) || !(payment.amount > 0))
        return badRequest("There is no open payment to submit")
      if (!/^\d{12}$/.test(clean(body.utr))) return badRequest("Enter the 12-digit UTR")
      const paidAt = parsePaidAt(body.paidAt)
      if (!paidAt) return badRequest("Enter a valid payment date")
      if (!r.h4.proofRefs.includes(body.screenshotFileRef)) return badRequest("Upload payment proof for this request")
      payment.utr = clean(body.utr)
      payment.paidAt = paidAt
      payment.screenshotFileRef = body.screenshotFileRef
      payment.status = "Submitted"
      payment.mode = "now"
      payment.submittedAt = new Date()
      payment.note = ""
      audit(
        r,
        u,
        `Payment proof submitted${u.external ? " by payer" : " through an IIT requester"}`,
        !body.additionalPaymentId && [S.PAYMENT_REQUESTED, S.PAYMENT_DEFERRED, S.PAYMENT_SUBMITTED].includes(r.status)
          ? S.PAYMENT_SUBMITTED
          : r.status,
      )
    })
    return notify(result)
  },
  async defer(id, body, user) {
    return mutate(id, body, user, (r, u) => {
      if (!canPay(r, u)) return forbidden()
      if ([S.REJECTED, S.CANCELLED, S.INVOICED].includes(r.status)) return badRequest("The financial record is closed")
      if (r.h4.amendment?.stage) return badRequest("Complete the pending date change first")
      const p = openPayment(r, body)
      if (!p || !["Pending", "Rejected"].includes(p.status) || !(p.amount > 0))
        return badRequest("There is no payment to defer")
      p.status = "Deferred"
      p.mode = "later"
      const operational = [S.ROOMS_ASSIGNED, S.CHECKED_IN, S.CHECKED_OUT].includes(r.status)
      audit(
        r,
        u,
        "Payment deferred; room assignment still requires verification",
        body.additionalPaymentId || operational ? r.status : S.PAYMENT_DEFERRED,
      )
    })
  },
  async verify(id, body, user) {
    const result = await mutate(id, body, user, (r, u) => {
      if (!isAccounts(u)) return forbidden()
      if (r.status === S.CANCELLED || r.status === S.INVOICED) return badRequest("This financial record is closed")
      const p = openPayment(r, body)
      if (!p || p.status !== "Submitted") return badRequest("Select a submitted payment")
      if (!["verify", "reject"].includes(body.action)) return badRequest("Choose verify or reject")
      if (body.action === "reject" && !clean(body.reason)) return badRequest("Enter a rejection reason")
      p.status = body.action === "verify" ? "Verified" : "Rejected"
      p.note = clean(body.reason)
      p.verifiedBy = u._id
      p.verifiedAt = new Date()
      const operational = [S.ROOMS_ASSIGNED, S.CHECKED_IN, S.CHECKED_OUT].includes(r.status)
      audit(
        r,
        u,
        `Payment ${body.action === "verify" ? "verified" : `rejected: ${clean(body.reason)}`}`,
        operational
          ? r.status
          : paid(r)
            ? S.PAYMENT_VERIFIED
            : !body.additionalPaymentId
              ? S.PAYMENT_REQUESTED
              : r.status,
      )
    })
    if (result.success) await h4Service.ensureInvoice(id)
    return notify(result)
  },
  async settle(id, body, user) {
    const result = await mutate(id, body, user, (r, u) => {
      if (!isAccounts(u)) return forbidden()
      if (r.status === S.CANCELLED || r.status === S.INVOICED || r.invoice?.generatedAt)
        return badRequest("This financial record is closed")
      const p = openPayment(r, body)
      if (!p || !p.amount || !clean(body.reason)) return badRequest("Select a payment and enter an accounts note")
      if (!["mark_paid", "mark_unpaid", "correct"].includes(body.action))
        return badRequest("Choose a valid accounts action")
      if (body.action !== "mark_unpaid") {
        if (body.action === "correct" && !["Submitted", "Verified"].includes(p.status))
          return badRequest("Payment details can only be corrected after collection")
        const date = parsePaidAt(body.paidAt)
        if (!date || !clean(body.reference)) return badRequest("Enter the payment reference and date")
        p.utr = clean(body.reference, 120)
        p.paidAt = date
      }
      if (body.action !== "correct") p.status = body.action === "mark_paid" ? "Verified" : "Pending"
      p.verifiedBy = u._id
      p.verifiedAt = new Date()
      p.note = clean(body.reason)
      const operational = [S.ROOMS_ASSIGNED, S.CHECKED_IN, S.CHECKED_OUT].includes(r.status)
      audit(
        r,
        u,
        `Accounts ${body.action}: ${clean(body.reason)}`,
        operational || body.action === "correct" ? r.status : paid(r) ? S.PAYMENT_VERIFIED : S.PAYMENT_REQUESTED,
      )
    })
    if (result.success) await h4Service.ensureInvoice(id)
    return notify(result)
  },
  async attachment(id, user, additionalPaymentId) {
    if (!validId(id)) return badRequest("Invalid request ID")
    const result = await h4Service.get(id, user)
    if (!result.success) return result
    const r = result.data
    // Gate and supervisors only need stay information, never payment screenshots.
    if (!(isCreator(r, user) || isFaculty(r, user) || isOffice(user) || isAccounts(user))) return forbidden()
    const p = additionalPaymentId ? r.additionalPayments.find((p) => String(p._id) === additionalPaymentId) : r.payment
    if (!p?.screenshotFileRef) return notFound("Payment proof")
    const { fileAccessService } = await import("../../../../services/storage/file-access.service.js")
    return success(await fileAccessService.getBuffer(p.screenshotFileRef))
  },
}
