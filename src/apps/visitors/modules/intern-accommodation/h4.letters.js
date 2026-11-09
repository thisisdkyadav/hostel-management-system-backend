// Letters to the intern (an external student). They have never heard of SMS,
// so every letter reads like an official Chief Warden Office letter: who it
// is from, what was requested and by whom, what to do next, and how to check
// that it is genuine. Internal staff keep the short status emails.
import env from "../../../../config/env.config.js"
import { baseEmailTemplate } from "../../../../services/email/email.templates.js"
import { S } from "./h4.helpers.js"

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
const portal = String(env.FRONTEND_URL || "").replace(/\/$/, "")
const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return ""
  }
}
// Stay dates are stored as UTC midnights.
const date = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : ""
const rs = (n) => {
  const v = Math.round(Number(n || 0) * 100) / 100
  return `Rs. ${v.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}/-`
}
const days = (n) => `${n} day${n === 1 ? "" : "s"}`
export const requestReference = (r) => `H4-${String(r._id).slice(-8).toUpperCase()}`

const TITLE = "IIT Indore hostel accommodation"
const SUBJECTS = {
  received: "Accommodation request received",
  charges: "Accommodation approved: charges and payment link",
  "charges-rejected": "Payment not verified: please submit again",
  extra: "Additional charge payable",
  "extra-rejected": "Additional payment not verified: please submit again",
  submitted: "Payment details received",
  verified: "Payment verified",
  photo: "Payment verified: upload your mess photo",
  "photo-rejected": "Mess photo not accepted: please upload again",
  "photo-approved": "Mess photo approved",
  room: "Room allotted",
  "date-change": "Change of stay dates under review",
  completed: "Stay completed: invoice attached",
  rejected: "Accommodation request not approved",
  cancelled: "Accommodation cancelled",
}

// Which letter the request's current state calls for. The key changes only
// when the student has something new to read, so a revision that only moves
// staff queues sends the student nothing. The address is part of the key, so
// a corrected email address receives the current letter.
export const studentLetterKind = (r) => {
  const pick = (kind, detail = "") => ({ kind, key: `${kind}:${detail}|${String(r.applicantEmail || "").toLowerCase()}` })
  if (r.status === S.DRAFT || !r.applicantEmail) return null
  if (r.status === S.CANCELLED) return pick("cancelled")
  if (r.status === S.REJECTED) return pick("rejected")
  if (!r.allotment?.hostelId) return pick("received", String(r.h4.facultyEmail || "").toLowerCase())
  if (r.h4.amendment?.stage) return pick("date-change", r.h4.amendment.changeId)
  if ([S.CHECKED_OUT, S.INVOICED].includes(r.status))
    return r.invoice?.generatedAt ? pick("completed", r.invoice.number) : null
  if (r.status === S.CHECKED_IN) return null
  const main = r.payment || {}
  if (main.status === "Pending") return pick("charges", main.amount)
  if (main.status === "Rejected") return pick("charges-rejected", main.verifiedAt && +new Date(main.verifiedAt))
  const extra = (r.additionalPayments || []).find((p) => ["Pending", "Rejected"].includes(p.status))
  if (extra)
    return pick(extra.status === "Rejected" ? "extra-rejected" : "extra", `${extra._id}:${extra.verifiedAt ? +new Date(extra.verifiedAt) : ""}`)
  const submitted = [main, ...(r.additionalPayments || [])].filter((p) => p.status === "Submitted")
  if (submitted.length) return pick("submitted", submitted.map((p) => p.utr).join(","))
  if (main.status !== "Verified") return null // deferred by the student
  if (r.rooms?.length) return pick("room", r.rooms.map((x) => String(x.roomId)).sort().join(","))
  if (r.h4.mess === "with" && r.h4.caterer) {
    const photo = r.h4.messPhoto || { status: "Pending" }
    if (photo.status === "Pending") return pick("photo", r.h4.caterer.catererId)
    if (photo.status === "Rejected") return pick("photo-rejected", photo.reviewedAt && +new Date(photo.reviewedAt))
    if (photo.status === "Approved") return pick("photo-approved")
    return null // the student just uploaded it
  }
  return pick("verified")
}

const p = (html) => `<p>${html}</p>`
const box = (cls, html) => `<div class="${cls}">${html}</div>`
const button = (url, label) =>
  `<p style="margin:20px 0 4px;"><a class="button" style="margin:0;" href="${esc(url)}">${esc(label)}</a></p><p class="muted-text" style="margin:0 0 16px;">Opens ${esc(hostOf(url))}</p>`
const table = (rows, { strongLast = false } = {}) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:14px;">${rows
    .filter(Boolean)
    .map(
      ([k, v], i, all) =>
        `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid #E2E8F0;color:#64748B;width:42%;vertical-align:top;">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#0A1628;${strongLast && i === all.length - 1 ? "font-weight:700;" : ""}">${v}</td></tr>`,
    )
    .join("")}</table>`

const contactLine = (config) => {
  const ways = [
    config.contactEmail && `<a href="mailto:${esc(config.contactEmail)}">${esc(config.contactEmail)}</a>`,
    config.contactPhone && esc(config.contactPhone),
  ].filter(Boolean)
  return `For any clarification, please contact the Chief Warden Office, IIT Indore${ways.length ? ` (${ways.join(", ")})` : ""}${config.contactEmail ? ", or reply to this email" : ""}.`
}

const stayDetails = (r, { hostelName, roomLabel }) =>
  table([
    ["Student", esc(r.applicantName)],
    r.h4.institute && ["Institute", esc(r.h4.institute)],
    ["Faculty supervisor", `${esc(r.h4.facultyName)}${r.h4.department ? `, ${esc(r.h4.department)}` : ""}`],
    ["Stay", `${esc(date(r.stay.fromDate))} to ${esc(date(r.stay.toDate))} (${esc(days(r.nights))})`],
    hostelName && ["Hostel", esc(hostelName)],
    roomLabel && ["Room", esc(roomLabel)],
    ["Reference", esc(requestReference(r))],
  ])

// What the charges are, as in the Chief Warden Office letter.
const chargesTable = (r, config) => {
  const q = r.quote || {}
  const accommodationNote = [
    !r.h4.accommodationAmountOverridden && r.h4.accommodationDailyRate
      ? `calculated at ${rs(r.h4.accommodationDailyRate)} per day for ${days(r.h4.accommodationChargeDays || r.nights)}`
      : "",
    q.gstAmount ? `including GST at ${q.gstPercentage}%` : "",
  ].filter(Boolean)
  const mess = r.h4.messCharge
  return table(
    [
      ["Accommodation Charges", `${rs(q.total)}${accommodationNote.length ? ` <span style="color:#64748B;">(${esc(accommodationNote.join(", "))})</span>` : ""}`],
      r.h4.mess === "with" && mess
        ? ["Mess Charges", `${rs(mess.amount)}${!mess.amountOverridden && mess.dailyRate ? ` <span style="color:#64748B;">(calculated at ${rs(mess.dailyRate)} per day for ${days(mess.days)})</span>` : ""}`]
        : ["Mess", "Not included"],
      ["Total Amount Payable", rs(r.payment?.amount)],
    ],
    { strongLast: true },
  )
}

const intro = (r, verb, { hostelName, config }) =>
  p(
    `This is with reference to your accommodation request for the internship at IIT Indore. We are pleased to inform you that accommodation has been ${verb} under the supervision of <strong>${esc(r.h4.facultyName)}</strong>${hostelName ? `, in <strong>${esc(hostelName)}</strong>, on a ${esc(config.occupancy || "double occupancy")} basis` : ""}.`,
  )

const facilities = (config) =>
  config.roomFacilities?.length
    ? `${p("The following facilities will be provided in the room:")}<ul style="margin:0 0 16px;padding-left:20px;line-height:1.7;font-size:14px;color:#334155;">${config.roomFacilities.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
    : ""

const pageButton = (link, label) =>
  link
    ? `${button(link, label)}${p(`<span class="muted-text">This is your personal link to your accommodation page. You do not need an account or password. The link is valid for 30 days.</span>`)}`
    : ""

const payBlock = (amount, paymentLink) =>
  paymentLink
    ? button(paymentLink, `Pay ${rs(amount)} online`)
    : p("Pay using the UPI QR code shown on your accommodation page (link below).")

const paySteps = (r, { kind }) => {
  const steps = [
    "Pay the total amount using the payment link above.",
    "Open your accommodation page using the button below and submit the 12-digit UTR (transaction reference), the payment date and a screenshot of the payment.",
    r.h4.mess === "with"
      ? "Once your payment is verified, upload a clear photo of your face on the same page. It is used to identify you at the mess."
      : "",
    "After verification, the hostel allots your room and you receive an email with the room number.",
  ].filter(Boolean)
  if (kind === "extra" || kind === "extra-rejected") steps.splice(2)
  return `<ol style="margin:0 0 16px;padding-left:20px;line-height:1.7;font-size:14px;color:#334155;">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
}

const nonRefundable = (r) =>
  p(
    `Please note that the amount paid towards accommodation${r.h4.mess === "with" ? " and mess facilities" : ""} is strictly non-refundable. You are requested to complete the payment within the stipulated time, and before your stay begins on ${esc(date(r.stay.fromDate))}, to confirm your accommodation.`,
  )

const genuine = (paymentLink, hasPage) =>
  box(
    "info-box",
    `<p style="margin:0 0 8px;font-size:13px;"><strong>About this email</strong></p><p style="margin:0;font-size:13px;">SMS (Student Management System, ${esc(hostOf(portal) || "the institute portal")}) is the official hostel and student services system of IIT Indore, run by the Chief Warden Office. This email was sent from an official IIT Indore (@iiti.ac.in) address because your accommodation was requested by an IIT Indore faculty member, who is copied on it.${hasPage ? ` Your accommodation page opens on ${esc(hostOf(portal) || "the institute portal")}${paymentLink && hostOf(paymentLink) && hostOf(paymentLink) !== hostOf(portal) ? `, and the payment link opens ${esc(hostOf(paymentLink))}` : ""}.` : ""} IIT Indore will never ask for your password or card PIN by email. If anything here looks wrong, contact the Chief Warden Office before paying.</p>`,
  )

const signOff = p("Regards,<br>Chief Warden Office<br>Indian Institute of Technology Indore")

const LETTERHEAD = {
  title: "IIT Indore",
  subtitle: "Chief Warden Office · Hostel Accommodation",
  footer:
    '<p>Sent by the Chief Warden Office, Indian Institute of Technology Indore, through SMS (Student Management System).</p><p style="margin-top: 4px;">Khandwa Road, Simrol, Indore 453552</p>',
}

// ctx: { config, link (access page, published only), hostelName, roomLabel, change (pending date change row) }
export const studentLetter = (r, kind, ctx) => {
  const { config, link } = ctx
  const pay = r.payment || {}
  const extra = (r.additionalPayments || []).find((x) => ["Pending", "Rejected"].includes(x.status))
  const greeting = p(`Dear ${esc(r.applicantName || "Student")},`)
  const details = stayDetails(r, ctx)
  const body = {
    received: () => {
      const by = r.h4.creatorName && r.h4.creatorEmail !== r.h4.facultyEmail ? ` by ${esc(r.h4.creatorName)}` : ""
      return [
        p(
          `This is with reference to your accommodation request for the internship at IIT Indore. We are pleased to inform you that hostel accommodation has been requested for you${by} under the supervision of <strong>${esc(r.h4.facultyName)}</strong>, for ${esc(date(r.stay.fromDate))} to ${esc(date(r.stay.toDate))}.`,
        ),
        details,
        p("The request is now being reviewed by your faculty supervisor and the Chief Warden Office. <strong>You do not need to do anything right now.</strong>"),
        p(
          `Once the request is approved, you will receive another email from this address with your hostel, the accommodation${config.messDailyRate ? " and mess" : ""} charges, and a link to pay. The charges are payable by you before your stay begins.`,
        ),
        p(`If any of the details above are wrong, please inform ${esc(r.h4.facultyName)}.`),
      ]
    },
    charges: () => [
      intro(r, "approved", ctx),
      facilities(config),
      p("<strong>Charges</strong>"),
      chargesTable(r, config),
      pay.remarks ? box("warning", `<strong>Note from the Chief Warden Office:</strong> ${esc(pay.remarks)}`) : "",
      payBlock(pay.amount, pay.paymentLink),
      p("<strong>What to do next</strong>"),
      paySteps(r, { kind }),
      pageButton(link, "Open your accommodation page"),
      nonRefundable(r),
      details,
    ],
    "charges-rejected": () => [
      p("This is with reference to your hostel accommodation at IIT Indore."),
      box("warning", `The payment details you submitted could not be verified${pay.note ? `: <strong>${esc(pay.note)}</strong>` : "."}`),
      p("Please check the payment and submit the correct UTR, payment date and screenshot again. If you have not paid yet, use the payment link below."),
      chargesTable(r, config),
      payBlock(pay.amount, pay.paymentLink),
      pageButton(link, "Open your accommodation page"),
      nonRefundable(r),
      details,
    ],
    extra: () => [
      p(`This is with reference to your hostel accommodation at IIT Indore. An additional charge of <strong>${rs(extra.amount)}</strong>${extra.label ? ` (${esc(extra.label)})` : ""} is payable for your stay.`),
      extra.remarks ? box("warning", `<strong>Note from the Chief Warden Office:</strong> ${esc(extra.remarks)}`) : "",
      payBlock(extra.amount, pay.paymentLink),
      paySteps(r, { kind }),
      pageButton(link, "Open your accommodation page"),
      details,
    ],
    "extra-rejected": () => [
      p("This is with reference to your hostel accommodation at IIT Indore."),
      box("warning", `The payment details you submitted for the additional charge of ${rs(extra.amount)} could not be verified${extra.note ? `: <strong>${esc(extra.note)}</strong>` : "."}`),
      p("Please check the payment and submit the correct details again."),
      payBlock(extra.amount, pay.paymentLink),
      pageButton(link, "Open your accommodation page"),
      details,
    ],
    submitted: () => [
      p("This is with reference to your hostel accommodation at IIT Indore. We have received your payment details. The Accounts section will verify the payment and you will receive an email once it is verified."),
      p("You do not need to do anything right now."),
      pageButton(link, "View your accommodation page"),
      details,
    ],
    verified: () => [
      intro(r, "confirmed", ctx),
      p(pay.amount > 0 ? `Your payment of <strong>${rs(pay.amount)}</strong> has been verified.` : "No payment is required for your accommodation."),
      p("The hostel will now allot your room. You will receive an email with the room number."),
      pageButton(link, "View your accommodation page"),
      details,
    ],
    photo: () => [
      intro(r, "confirmed", ctx),
      p(pay.amount > 0 ? `Your payment of <strong>${rs(pay.amount)}</strong> has been verified.` : "No payment is required for your accommodation."),
      box("warning", `<strong>One more step:</strong> your mess is <strong>${esc(r.h4.caterer?.name)}</strong>. Please upload a clear, recent photo of your face on your accommodation page. It is used to identify you at the mess. The Chief Warden Office will check it, and then the hostel will allot your room.`),
      pageButton(link, "Upload your photo"),
      details,
    ],
    "photo-rejected": () => [
      p("This is with reference to your hostel accommodation at IIT Indore."),
      box("warning", `Your mess photo was not accepted${r.h4.messPhoto?.note ? `: <strong>${esc(r.h4.messPhoto.note)}</strong>` : "."} Please upload a new, clear photo of your face. Your room is allotted after the photo is approved.`),
      pageButton(link, "Upload a new photo"),
      details,
    ],
    "photo-approved": () => [
      p(`This is with reference to your hostel accommodation at IIT Indore. Your mess photo has been approved. Your mess is <strong>${esc(r.h4.caterer?.name)}</strong>.`),
      p("The hostel will now allot your room. You will receive an email with the room number."),
      pageButton(link, "View your accommodation page"),
      details,
    ],
    room: () => [
      p(`This is with reference to your hostel accommodation at IIT Indore. Your room has been allotted: <strong>${esc(ctx.hostelName)}${ctx.roomLabel ? `, ${esc(ctx.roomLabel)}` : ""}</strong>.`),
      r.h4.mess === "with" && r.h4.caterer ? p(`Your mess is <strong>${esc(r.h4.caterer.name)}</strong>.`) : "",
      p(`Please report to the hostel office on ${esc(date(r.stay.fromDate))} with a valid photo identity card.`),
      details,
      pageButton(link, "View your accommodation page"),
    ],
    "date-change": () => [
      p(
        `This is with reference to your hostel accommodation at IIT Indore. A change of your stay dates${ctx.change ? ` to <strong>${esc(date(ctx.change.requestedFromDate || r.stay.fromDate))} to ${esc(date(ctx.change.requestedToDate))}</strong>` : ""} has been requested and is under review by the Chief Warden Office. You will receive an email once it is decided. Until then, your current dates remain.`,
      ),
      details,
      pageButton(link, "View your accommodation page"),
    ],
    completed: () => [
      p(`This is with reference to your hostel accommodation at IIT Indore. Your stay has been completed. The invoice${r.invoice?.number ? ` <strong>${esc(r.invoice.number)}</strong>` : ""} for your stay is attached to this email.`),
      p("Thank you for staying with us. We wish you the very best."),
      details,
    ],
    rejected: () => {
      const reason = [...(r.approvals || [])].reverse().find((a) => a.action === "reject")?.reason
      return [
        p("This is with reference to your accommodation request for the internship at IIT Indore. We regret to inform you that the request could not be approved."),
        reason ? box("warning", `<strong>Reason:</strong> ${esc(reason)}`) : "",
        p(`Please contact ${esc(r.h4.facultyName)} for further guidance.`),
        details,
      ]
    },
    cancelled: () => [
      p("This is with reference to your hostel accommodation at IIT Indore. We wish to inform you that the accommodation has been cancelled."),
      r.h4.cancellation?.reason ? box("warning", `<strong>Reason:</strong> ${esc(r.h4.cancellation.reason)}`) : "",
      r.h4.cancellation?.refundNote ? p(esc(r.h4.cancellation.refundNote)) : "",
      p("Any links sent earlier for this request no longer work."),
      details,
    ],
  }[kind]
  if (!body) return null
  const subject = `${SUBJECTS[kind]} – ${TITLE}`
  const content = [
    `<h2>${esc(SUBJECTS[kind])}</h2>`,
    greeting,
    ...body(),
    p(contactLine(config)),
    signOff,
    genuine(["charges", "charges-rejected", "extra", "extra-rejected"].includes(kind) ? pay.paymentLink : "", !!link),
  ].join("")
  return { subject, html: baseEmailTemplate(content, LETTERHEAD) }
}
