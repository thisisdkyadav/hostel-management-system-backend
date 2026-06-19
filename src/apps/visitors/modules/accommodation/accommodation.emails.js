/**
 * Accommodation email helpers (front-half of the workflow).
 * Thin wrappers over emailService.sendCustomEmail.
 */

import { emailService } from "../../../../services/email/index.js"
import env from "../../../../config/env.config.js"

const money = (n) => `Rs. ${(Number(n) || 0).toFixed(2)}`

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

const quoteHtml = (quote = {}) => `
  <table style="border-collapse:collapse;margin-top:8px">
    <tr><td style="padding:2px 12px 2px 0">Guests</td><td>${quote.persons || 0}</td></tr>
    <tr><td style="padding:2px 12px 2px 0">Nights</td><td>${quote.nights || 0}</td></tr>
    <tr><td style="padding:2px 12px 2px 0">Subtotal</td><td>${money(quote.subtotal)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0">GST (${quote.gstPercentage || 0}%)</td><td>${money(quote.gstAmount)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0"><strong>Estimated total</strong></td><td><strong>${money(quote.total)}</strong></td></tr>
  </table>`

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
    <p>Dear Faculty Advisor,</p>
    <p><strong>${studentName || "A student"}</strong> has requested hostel accommodation for visitors and
    listed you as their faculty advisor. Your recommendation is requested.</p>
    ${studentHtml(student)}
    <p>Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)} ·
    Guests: ${request?.persons || 0} · Purpose: ${request?.stay?.purpose || "-"}</p>
    <p>Please review and respond using the secure link below (no login required):</p>
    <p><a href="${link}">${link}</a></p>
    <p>This link is single-use and will expire.</p>`
  await emailService.sendCustomEmail({ to, subject: `Accommodation recommendation requested by ${studentName || "a student"}`, body })
}

export const sendStudentSubmittedEmail = async ({ to, studentName, quote, request }) => {
  if (!to) return
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your accommodation request has been submitted and is now under review.</p>
    <p>Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)}</p>
    <p>Estimated charges (final amount confirmed at approval):</p>
    ${quoteHtml(quote)}
    <p>You will be notified as your request progresses.</p>
    ${ctaButton(studentRequestLink(request?._id))}`
  await emailService.sendCustomEmail({ to, subject: "Accommodation request submitted", body })
}

export const sendPaymentRequestEmail = async ({ to, studentName, amount, paymentLink, request }) => {
  if (!to) return
  const payHtml = paymentLink
    ? `<p>Pay using this link / QR: <a href="${paymentLink}">${paymentLink}</a></p>`
    : `<p>Please use the payment QR shown on your request page in the HMS portal.</p>`
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your accommodation request has been approved. Please pay <strong>${money(amount)}</strong>
    before the guests arrive.</p>
    ${payHtml}
    <p>Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)}</p>
    <p>After paying, upload a screenshot of the payment on the HMS portal so it can be verified.</p>
    ${ctaButton(studentRequestLink(request?._id), "Pay & upload proof")}`
  await emailService.sendCustomEmail({ to, subject: "Payment requested for your accommodation request", body })
}

export const sendAllotmentEmail = async ({ to, studentName, hostelName, request }) => {
  if (!to) return
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your guests have been allotted accommodation at <strong>${hostelName || "the assigned hostel"}</strong>.</p>
    <p>Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)}</p>
    <p>Room details will be assigned on arrival. You can track this on the HMS portal.</p>
    ${ctaButton(studentRequestLink(request?._id))}`
  await emailService.sendCustomEmail({ to, subject: "Accommodation allotted for your guests", body })
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

export const sendInvoiceEmail = async ({ to, studentName, number, quote, gstin, hostelName, request }) => {
  if (!to) return
  const gstinLine = gstin ? `<p>GSTIN: ${gstin}</p>` : ""
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your accommodation invoice <strong>${number}</strong> is ready.</p>
    <p>Hostel: ${hostelName || "-"} · Stay: ${formatDate(request?.stay?.fromDate)} to ${formatDate(request?.stay?.toDate)}</p>
    ${quoteHtml(quote)}
    ${gstinLine}
    <p>Thank you for using the HMS guest accommodation service.</p>
    ${ctaButton(studentRequestLink(request?._id), "View invoice")}`
  await emailService.sendCustomEmail({ to, subject: `Accommodation invoice ${number}`, body })
}

export const sendStudentDecisionEmail = async ({ to, studentName, status, reason, requestId }) => {
  if (!to) return
  const reasonHtml = reason ? `<p>Remarks: ${reason}</p>` : ""
  const body = `
    <p>Dear ${studentName || "Student"},</p>
    <p>Your accommodation request status is now: <strong>${status}</strong>.</p>
    ${reasonHtml}
    <p>You can view the latest details on the HMS portal.</p>
    ${ctaButton(studentRequestLink(requestId))}`
  await emailService.sendCustomEmail({ to, subject: `Accommodation request: ${status}`, body })
}
