import { emailService } from "../../../../services/email/index.js"
import env from "../../../../config/env.config.js"
import { accommodationOwner as owner } from "../../../../services/accommodation/accommodationOwner.service.js"
import { accommodationQueries as queries } from "../../../../services/accommodation/accommodationQueries.service.js"
import { fileAccessService } from "../../../../services/storage/file-access.service.js"
import {
  createActionLinkToken,
  invalidateActionLinkTokens,
  findActionLinkTokens,
  getRawActionLinkToken,
} from "../../../../services/action-links/action-link-token.service.js"
import {
  chiefWardenEmails,
  chiefWardenOfficeEmails,
  accountantEmails,
  supervisorsForHostel,
} from "../accommodation/accommodation.recipients.js"
import { S } from "./h4.helpers.js"
import { h4Service } from "./h4.service.js"

export const H4_TOKEN_TYPE = "h4_request_access"
const esc = (v) =>
  String(v || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
const base = String(env.FRONTEND_URL || "").replace(/\/$/, "")
const roleLink = (r, role) => `${base}/${role}/intern-accommodation?request=${r._id}`
export const h4Notifications = {
  async invalidateAccess(id) {
    await invalidateActionLinkTokens({ type: H4_TOKEN_TYPE, subjectId: id }, "Request details or access changed")
  },
  async accessLink(r, purpose) {
    const email = purpose === "payer" ? r.h4.payer.email : r.applicantEmail
    const tokens = await findActionLinkTokens({
      type: H4_TOKEN_TYPE,
      subjectId: r._id,
      recipientEmail: email,
      "payload.purpose": purpose,
      invalidatedAt: null,
      expiresAt: { $gt: new Date() },
    })
    let rawToken = tokens.length ? getRawActionLinkToken(tokens[0]) : ""
    if (!rawToken) {
      const out = await createActionLinkToken({
        type: H4_TOKEN_TYPE,
        subjectModel: "AccommodationRequest",
        subjectId: r._id,
        recipientEmail: email,
        payload: { purpose },
        expiresAt: new Date(Date.now() + 30 * 86400000),
      })
      rawToken = out.rawToken
    }
    return `${base}/intern-accommodation/access/${rawToken}`
  },
  async handoff(r) {
    if (!r?.h4 || r.status === S.DRAFT) return
    await owner.queueH4Notification(r._id, r.h4.revision)
  },
  async messages(r) {
    const recipients = []
    const stage = r.h4.amendment?.stage || r.currentStage
    if (stage === "faculty")
      recipients.push({ email: r.h4.facultyEmail, link: roleLink(r, "academics"), label: "Review and confirm payer" })
    if (stage === "office")
      for (const email of await chiefWardenOfficeEmails())
        recipients.push({ email, link: roleLink(r, "admin"), label: "Check accommodation availability" })
    if (stage === "chief")
      for (const email of await chiefWardenEmails())
        recipients.push({ email, link: roleLink(r, "admin"), label: "Review H4 request" })
    if (r.payment?.status === "Submitted" || r.h4.messPayment?.status === "Submitted" || r.additionalPayments?.some((p) => p.status === "Submitted"))
      for (const email of await accountantEmails())
        recipients.push({ email, link: roleLink(r, "admin"), label: "Verify accommodation / mess payment" })
    if (r.status === S.PAYMENT_VERIFIED)
      for (const email of await supervisorsForHostel(r.allotment?.hostelId))
        recipients.push({ email, link: roleLink(r, "hostel-supervisor"), label: "Assign room" })
    const published = !!r.allotment?.hostelId && ![S.REJECTED, S.CANCELLED].includes(r.status)
    if (
      published &&
      [
        S.PAYMENT_REQUESTED,
        S.PAYMENT_DEFERRED,
        S.PAYMENT_SUBMITTED,
        S.PAYMENT_VERIFIED,
        S.ROOMS_ASSIGNED,
        S.CHECKED_IN,
        S.CHECKED_OUT,
        S.INVOICED,
      ].includes(r.status)
    ) {
      recipients.push({
        email: r.applicantEmail,
        link: await this.accessLink(r, "intern"),
        label: r.h4.messPayment ? "View stay and mess payment" : "View stay details",
      })
      recipients.push({
        email: r.h4.payer.email,
        link: await this.accessLink(r, "payer"),
        label: "View payment and invoice",
      })
    }
    if ([S.CANCELLED, S.REJECTED].includes(r.status)) {
      recipients.push(
        { email: r.applicantEmail, link: "", label: "" },
        { email: r.h4.payer.email, link: "", label: "" },
      )
    }
    recipients.push({ email: r.h4.creatorEmail, link: "", label: "" })
    const messages = []
    const unique = new Map()
    for (const recipient of recipients) {
      if (!unique.has(recipient.email)) unique.set(recipient.email, { email: recipient.email, links: new Map() })
      if (recipient.link) unique.get(recipient.email).links.set(recipient.link, recipient.label)
    }
    for (const recipient of unique.values()) {
      if (!recipient.email) continue
      const amount = [r.payment, ...(r.additionalPayments || [])]
        .filter((p) => p?.status !== "Verified")
        .reduce((s, p) => s + (p.amount || 0), 0)
      const links = [...recipient.links]
        .map(([url, label]) => `<p><a href="${esc(url)}">${esc(label)}</a></p>`)
        .join("")
      const expires = [...recipient.links.keys()].some((url) => url.includes("/intern-accommodation/access/"))
      messages.push({
        to: recipient.email,
        subject: `H4 · ${r.applicantName} · ${r.h4.amendment?.stage ? "Date change review" : r.status}`,
        body: `<p><strong>${esc(r.applicantName)}</strong></p><p>${esc(r.status)}${r.h4.amendment?.stage ? " · Date change pending" : ""}</p><p>Stay: ${esc(new Date(r.stay.fromDate).toISOString().slice(0, 10))} to ${esc(new Date(r.stay.toDate).toISOString().slice(0, 10))}</p>${published ? `<p>Accommodation ${r.payment?.status === "Verified" ? "payment received" : "payable"}: ₹${(r.payment?.status === "Verified" ? r.payment.amount : amount).toFixed(2)} · Payer: ${esc(r.h4.payer.name)}</p>${recipient.email === r.applicantEmail && r.h4.messPayment ? `<p>Mess ${r.h4.messPayment.status === "Verified" ? "payment received" : "payment"}: ₹${Number(r.h4.messPayment.amount || 0).toFixed(2)} · ${esc(r.h4.messPayment.status)}. Paid by the student. ${r.h4.messPayment.paymentLink && r.h4.messPayment.status !== "Verified" ? `<a href="${esc(r.h4.messPayment.paymentLink)}">Pay mess charges</a>` : ""}</p>` : ""}<p>The invoice covers hostel accommodation only and is issued after checkout. Mess payment confirmation is provided in this email.</p>` : ""}${published && recipient.email === r.h4.payer.email && r.payment.remarks ? `<p>${esc(r.payment.remarks)}</p>` : ""}${links}${expires ? "<p>External access links expire in 30 days.</p>" : ""}`,
        attachments:
          r.invoice?.generatedAt && [S.CHECKED_OUT, S.INVOICED].includes(r.status) && recipient.email === r.h4.payer.email
            ? [
                {
                  filename: `${r.invoice.number.replace(/[^\w-]/g, "-")}.pdf`,
                  content: (r.invoice.pdfFileRef ? await fileAccessService.getBuffer(r.invoice.pdfFileRef) : (await h4Service.invoice(String(r._id), { external: "payer" }, true)).data).buffer,
                  contentType: "application/pdf",
                },
              ]
            : [],
      })
    }
    return messages
  },
  async deliver(r) {
    let failure = ""
    try {
      const failures = []
      for (const message of await this.messages(r)) {
        const result = await emailService.sendCustomEmail(message)
        if (!result?.success) failures.push(result?.error || "Email delivery failed")
      }
      failure = failures.length
        ? "Email delivery failed. Delivery will retry automatically; you can also resend links."
        : ""
    } catch (e) {
      console.error("H4 notification failed:", e.message)
      failure = "Could not send notification. Delivery will retry automatically."
    }
    await owner.setNotificationError(r._id, failure)
    return failure
  },
  async drain(limit = 5) {
    let count = 0
    for (let i = 0; i < limit; i++) {
      const job = await owner.claimH4Notification()
      if (!job) break
      try {
        const r = await queries.findH4ById(job.requestId, { lean: true })
        const failure = r && r.status !== S.DRAFT ? await this.deliver(r) : ""
        await owner.completeH4Notification(job, failure)
        count++
      } catch (e) {
        await owner.completeH4Notification(job, "Delivery worker failed; retry pending")
      }
    }
    return count
  },
}
