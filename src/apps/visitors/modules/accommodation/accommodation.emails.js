/**
 * Accommodation email helpers (front-half of the workflow).
 * Thin wrappers over emailService.sendCustomEmail.
 */

import { emailService } from "../../../../services/email/index.js"
import env from "../../../../config/env.config.js"
import { ACCOMMODATION_STATUS } from "../../../../models/accommodation/AccommodationRequest.model.js"

const money = (n) => `Rs. ${(Number(n) || 0).toFixed(2)}`

/** Soft labels for students — avoid "approve/approved" before hostel allotment. */
const STUDENT_STATUS_LABEL = {
  [ACCOMMODATION_STATUS.PENDING_CWO_CAPACITY]: "Checking availability",
  [ACCOMMODATION_STATUS.PENDING_FA_RECOMMENDATION]: "With faculty advisor / supervisor",
  [ACCOMMODATION_STATUS.PENDING_CW_APPROVAL]: "With Chief Warden",
  [ACCOMMODATION_STATUS.CW_APPROVED]: "Processing — payment details coming",
  [ACCOMMODATION_STATUS.RETURNED_TO_STUDENT]: "Returned for updates",
}

const studentStatusLabel = (status) => STUDENT_STATUS_LABEL[status] || status

// Deep link straight to the student's request detail (mirrors AccommodationPage's
// ?request=<id> handler, same scheme the POR/event approval emails use).
const studentRequestLink = (requestId) =>
  requestId ? `${String(env.FRONTEND_URL || "").replace(/\/+$/, "")}/student/visitors?request=${requestId}` : ""

const ctaButton = (link, label = "View request") =>
  link
    ? `<p style="margin-top:18px"><a href="${link}" style="display:inline-block;background:#1360AB;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${label}</a></p>
       <p style="font-size:12px;color:#6b7280;margin-top:4px">Or open this link: <a href="${link}">${link}</a></p>`
    : ""

const formatDate = (d) => {
  if (!d) return ""
  try {
    return new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return ""
  }
}

const quoteHtml = (quote = {}) => {
  const lines = Array.isArray(quote.guestCharges) ? quote.guestCharges : []
  const guestRows = lines
    .map(
      (g) =>
        `<tr><td style="padding:2px 12px 2px 0">${g.guestName || `Guest ${(g.guestIndex ?? 0) + 1}`}</td>` +
        `<td>${money(g.price)} + GST ${g.gstPercentage || 0}% = ${money(g.total)}</td></tr>`
    )
    .join("")
  return `
  <table style="border-collapse:collapse;margin-top:8px">
    <tr><td style="padding:2px 12px 2px 0">Guests</td><td>${quote.persons || 0}</td></tr>
    <tr><td style="padding:2px 12px 2px 0">Nights</td><td>${quote.nights || 0}</td></tr>
    ${guestRows}
    <tr><td style="padding:2px 12px 2px 0">Subtotal</td><td>${money(quote.subtotal)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0">GST</td><td>${money(quote.gstAmount)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0"><strong>Total</strong></td><td><strong>${money(quote.total)}</strong></td></tr>
  </table>`
}

const row = (label, value) =>
  value ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${label}</td><td>${value}</td></tr>` : ""

const studentHtml = (student = {}) => {
  const academic = [student.degree, student.department].filter(Boolean).join(" · ")
  const room = [student.hostel, student.displayRoom].filter(Boolean).join(" · ")
  const rows = [
    row("Name", student.name),
    row("Roll number", student.rollNumber),
    row("Programme", academic),
    row("Year", student.year),
    row("Email", student.email),
    row("Phone", student.phone),
    row("Current room", room),
  ].join("")
  if (!rows) return ""
  return `
    <p style="margin-bottom:4px"><strong>Student details</strong></p>
    <table style="border-collapse:collapse;margin-bottom:8px">${rows}</table>`
}

export const sendFacultyRecommendationRequestEmail = async ({ to, studentName, rawToken, request, student }) => {
  if (!to || !rawToken) return
  const link = `${env.FRONTEND_URL}/accommodation/recommendation/${rawToken}`
  const body = `
    <p>Dear Faculty Advisor / Supervisor,</p>
    <p><strong>${studentName || "A student"}</strong> has requested hostel accommodation for visitors and
    listed you as their faculty advisor / supervisor. Your recommendation is requested.</p>
    ${studentHtml(student)}
    <p>Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)} ·
    Guests: ${request?.persons || 0} · Room preference: ${request?.roomPreference || "-"} ·
    Purpose: ${request?.stay?.purpose || "-"}</p>
    <p>Please review and respond using the secure link below (no login required):</p>
    <p><a href="${link}">${link}</a></p>
    <p>This link is single-use and will expire.</p>`
  await emailService.sendCustomEmail({ to, subject: `Accommodation recommendation requested by ${studentName || "a student"}`, body })
}

export const sendStudentSubmittedEmail = async ({ to, studentName, request }) => {
  if (!to) return
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your accommodation request has been submitted and is now under review.</p>
    <p>Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)} ·
    Guests: ${request?.persons || 0} · Room preference: ${request?.roomPreference || "-"}</p>
    <p>The Chief Warden Office will set the payable amount if your request is approved.
    You will be notified as your request progresses.</p>
    ${ctaButton(studentRequestLink(request?._id))}`
  await emailService.sendCustomEmail({ to, subject: "Accommodation request submitted", body })
}

export const sendPaymentRequestEmail = async ({ to, studentName, amount, paymentLink, hostelName, request }) => {
  if (!to) return
  const payHtml = paymentLink
    ? `<p>Pay using this link / QR: <a href="${paymentLink}">${paymentLink}</a></p>`
    : `<p>Please use the payment QR shown on your request page in the SMS portal.</p>`
  const hostelLine = hostelName
    ? `<p>Your guests have been allotted accommodation at <strong>${hostelName}</strong>.</p>`
    : ""
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your accommodation request has been approved. The amount payable is <strong>${money(amount)}</strong>.</p>
    ${hostelLine}
    ${payHtml}
    <p>Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)}</p>
    <p>Pay now and upload the UTR, payment date and a screenshot on the SMS portal — or choose
    <strong>Pay later</strong>. Rooms will be allocated only after payment; you can pay when the guest arrives.</p>
    ${ctaButton(studentRequestLink(request?._id), "Pay & upload proof")}`
  await emailService.sendCustomEmail({ to, subject: "Payment requested for your accommodation request", body })
}

export const sendRoomsAssignedEmail = async ({ to, studentName, hostelName, request }) => {
  if (!to) return
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Room(s) have been assigned for your guests at <strong>${hostelName || "the hostel"}</strong>.</p>
    <p>Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)}</p>
    ${ctaButton(studentRequestLink(request?._id))}`
  await emailService.sendCustomEmail({ to, subject: "Rooms assigned for your guests", body })
}

export const sendInvoiceEmail = async ({ to, studentName, number, quote, gstin, hostelName, request, pdf }) => {
  if (!to) return
  const gstinLine = gstin ? `<p>GSTIN: ${gstin}</p>` : ""
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your accommodation invoice <strong>${number}</strong> is ready${pdf ? " and attached to this email" : ""}.</p>
    <p>Hostel: ${hostelName || "-"} · Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)}</p>
    ${quoteHtml(quote)}
    ${gstinLine}
    <p>Thank you for using the SMS guest accommodation service.</p>
    ${ctaButton(studentRequestLink(request?._id), "View invoice")}`
  const attachments = pdf
    ? [{ filename: `${String(number).replace(/[^\w-]+/g, "-")}.pdf`, content: pdf, contentType: "application/pdf" }]
    : []
  await emailService.sendCustomEmail({ to, subject: `Accommodation invoice ${number}`, body, attachments })
}

const staffQueueLink = () =>
  `${String(env.FRONTEND_URL || "").replace(/\/+$/, "")}/admin/visitors`

/**
 * Tells the desk that now owns a request that it is waiting on them. `to` is a
 * list; an empty list is a no-op, so a missing role never throws.
 */
export const sendStaffQueueEmail = async ({ to = [], heading, action, request, student, extra = "" }) => {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (recipients.length === 0) return

  const who = student?.name || request?.applicantName || "A student"
  const rollNumber = student?.rollNumber ? ` (${student.rollNumber})` : ""
  const body = `
    <p>${heading}</p>
    ${row("Student", `${who}${rollNumber}`)}
    ${row("Guests", request?.persons ?? (request?.guests?.length || 0))}
    ${row("Stay", `${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)}`)}
    ${request?.stay?.purpose ? row("Purpose", request.stay.purpose) : ""}
    ${extra}
    <p><strong>Action needed:</strong> ${action}</p>
    ${ctaButton(staffQueueLink(), "Open the queue")}`

  await emailService.sendCustomEmail({
    to: recipients,
    subject: `Guest accommodation — ${action}`,
    body,
  })
}

export const sendStudentDecisionEmail = async ({ to, studentName, status, reason, requestId }) => {
  if (!to) return
  const label = studentStatusLabel(status)
  const reasonHtml = reason ? `<p>Remarks: ${reason}</p>` : ""
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your accommodation request status is now: <strong>${label}</strong>.</p>
    ${reasonHtml}
    <p>You can view the latest details on the SMS portal.</p>
    ${ctaButton(studentRequestLink(requestId))}`
  await emailService.sendCustomEmail({ to, subject: `Accommodation request: ${label}`, body })
}
