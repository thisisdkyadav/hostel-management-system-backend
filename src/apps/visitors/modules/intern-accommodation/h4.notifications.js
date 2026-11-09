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
import { S, isClosed, messReady } from "./h4.helpers.js"
import { h4Service } from "./h4.service.js"
import { getH4Config } from "./h4.config.js"
import { studentLetterKind, studentLetter } from "./h4.letters.js"
import { hostelQueries } from "../../../../services/hostel/hostelQueries.service.js"

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
  async accessLink(r, purpose = "intern") {
    const email = r.applicantEmail
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
  async handoff(r, { digest = false } = {}) {
    if (!r?.h4 || r.status === S.DRAFT) return
    await owner.queueH4Notification(r._id, r.h4.revision, { digest })
  },
  // Institute-side recipients (queues + creator). Bulk actions send these one
  // digest instead of an email per student; the student always gets their own.
  async internal(r) {
    const recipients = []
    const stage = r.h4.amendment?.stage || r.currentStage
    if (stage === "faculty")
      recipients.push({ email: r.h4.facultyEmail, role: "academics", label: "Review and recommend" })
    if (stage === "office")
      for (const email of await chiefWardenOfficeEmails())
        recipients.push({ email, role: "admin", label: "Check accommodation availability" })
    if (stage === "chief")
      for (const email of await chiefWardenEmails())
        recipients.push({ email, role: "admin", label: "Review H4 request" })
    if (r.status === S.CW_APPROVED && !r.allotment?.hostelId)
      for (const email of await chiefWardenOfficeEmails())
        recipients.push({ email, role: "admin", label: "Issue charges" })
    if (r.payment?.status === "Submitted" || r.additionalPayments?.some((p) => p.status === "Submitted"))
      for (const email of await accountantEmails())
        recipients.push({ email, role: "admin", label: "Verify payment" })
    if (r.h4.mess === "with" && !r.h4.caterer && r.payment?.status === "Verified" && !isClosed(r))
      for (const email of await accountantEmails())
        recipients.push({ email, role: "admin", label: "Assign mess caterer" })
    if (r.h4.messPhoto?.status === "Submitted" && !isClosed(r))
      for (const email of await chiefWardenOfficeEmails())
        recipients.push({ email, role: "admin", label: "Review mess photo" })
    if (r.status === S.PAYMENT_VERIFIED && messReady(r))
      for (const email of await supervisorsForHostel(r.allotment?.hostelId))
        recipients.push({ email, role: "hostel-supervisor", label: "Assign room" })
    recipients.push({ email: r.h4.creatorEmail, role: "academics", label: "" })
    return recipients
  },
  // Staff get a short status email; the student gets a full letter (h4.letters.js)
  // only when there is something new for them, with the faculty in CC.
  async messages(r, { skipInternal = false } = {}) {
    const letter = await this.studentMessage(r)
    const unique = new Map()
    for (const x of skipInternal ? [] : await this.internal(r)) {
      if (!x.email) continue
      const key = x.email.toLowerCase()
      if (!unique.has(key)) unique.set(key, { email: x.email, links: new Map() })
      if (x.label) unique.get(key).links.set(roleLink(r, x.role), x.label)
    }
    const published = !!r.allotment?.hostelId && ![S.REJECTED, S.CANCELLED].includes(r.status)
    const messages = []
    for (const [key, recipient] of unique) {
      if (key === String(r.applicantEmail || "").toLowerCase()) continue
      // Nothing to act on and copied on the student's letter: that is enough.
      if (!recipient.links.size && letter?.cc && key === letter.cc.toLowerCase()) continue
      const links = [...recipient.links].map(([url, label]) => `<p><a href="${esc(url)}">${esc(label)}</a></p>`).join("")
      messages.push({
        to: recipient.email,
        subject: `H4 · ${r.applicantName} · ${r.h4.amendment?.stage ? "Date change review" : r.status}`,
        body: `<p><strong>${esc(r.applicantName)}</strong></p><p>${esc(r.status)}${r.h4.amendment?.stage ? " · Date change pending" : ""}</p><p>Stay: ${esc(new Date(r.stay.fromDate).toISOString().slice(0, 10))} to ${esc(new Date(r.stay.toDate).toISOString().slice(0, 10))}</p>${published ? this.billHtml(r) : ""}${letter ? `<p>The student has been emailed: ${esc(letter.kindLabel)}.</p>` : ""}${links}`,
      })
    }
    if (letter) messages.push(letter)
    return messages
  },
  async studentMessage(r) {
    const pick = studentLetterKind(r)
    if (!pick || pick.key === r.h4.studentLetter?.key) return null
    const config = await getH4Config()
    const published = !!r.allotment?.hostelId && ![S.REJECTED, S.CANCELLED].includes(r.status)
    const [hostel, rooms] = published
      ? await Promise.all([
          hostelQueries.findHostelById(r.allotment.hostelId),
          r.rooms?.length ? hostelQueries.findRoomsByIds(r.rooms.map((x) => x.roomId)) : [],
        ])
      : [null, []]
    const room = rooms[0]
    const letter = studentLetter(r, pick.kind, {
      config,
      link: published && pick.kind !== "completed" ? await this.accessLink(r) : "",
      hostelName: hostel?.name || "",
      roomLabel: room ? `Room ${[room.unitId?.unitNumber, room.roomNumber].filter(Boolean).join(" / ")}` : "",
      change: r.h4.amendment?.changeId
        ? (r.scheduleChanges || []).find((c) => String(c._id) === String(r.h4.amendment.changeId))
        : null,
    })
    if (!letter) return null
    const faculty = r.h4.facultyEmail
    return {
      to: r.applicantEmail,
      cc: faculty && faculty.toLowerCase() !== r.applicantEmail.toLowerCase() ? faculty : undefined,
      replyTo: config.contactEmail || undefined,
      subject: letter.subject,
      body: letter.html,
      useTemplate: false,
      studentKey: pick.key,
      kindLabel: letter.subject.split(" – ")[0],
      attachments:
        pick.kind === "completed"
          ? [
              {
                filename: `${r.invoice.number.replace(/[^\w-]/g, "-")}.pdf`,
                content: (r.invoice.pdfFileRef ? await fileAccessService.getBuffer(r.invoice.pdfFileRef) : (await h4Service.invoice(String(r._id), { external: "intern" }, true)).data).buffer,
                contentType: "application/pdf",
              },
            ]
          : [],
    }
  },
  // Staff summary of the one bill: accommodation (with GST) plus mess.
  billHtml(r) {
    const rupees = (n) => `₹${Number(n || 0).toFixed(2)}`
    const mess = r.h4.messCharge?.amount || 0
    const parts = [`Accommodation ${rupees(r.quote?.total)}${r.quote?.gstAmount ? " incl. GST" : ""}`, ...(r.h4.mess === "with" ? [`Mess ${rupees(mess)}`] : [])]
    const due = [r.payment, ...(r.additionalPayments || [])].filter((p) => p && p.status !== "Verified").reduce((n, p) => n + (p.amount || 0), 0)
    const open = r.payment && r.payment.status !== "Verified"
    return `<p>${open ? "Amount payable" : "Payment received"}: <strong>${rupees(open ? due : r.payment?.amount)}</strong> (${parts.join(" + ")}).${open ? " Paid by the student." : ""}</p>`
  },
  async digestMessages(job) {
    const requests = await queries.listH4({ _id: { $in: job.requestIds } }, { limit: job.requestIds.length })
    const byEmail = new Map()
    for (const r of requests)
      for (const x of await this.internal(r)) {
        if (!x.email) continue
        if (!byEmail.has(x.email)) byEmail.set(x.email, { role: x.role, groups: new Map() })
        const entry = byEmail.get(x.email)
        if (x.label) entry.role = x.role
        const label = x.label || "Updated"
        if (!entry.groups.has(label)) entry.groups.set(label, new Map())
        entry.groups.get(label).set(String(r._id), r)
      }
    return [...byEmail].map(([email, { role, groups }]) => {
      // A request waiting on this recipient is listed only under that action.
      const updated = groups.get("Updated")
      if (updated)
        for (const [label, rows] of groups) if (label !== "Updated") for (const id of rows.keys()) updated.delete(id)
      if (updated && !updated.size) groups.delete("Updated")
      const sections = [...groups]
        .sort(([a], [b]) => (a === "Updated") - (b === "Updated"))
        .map(
          ([label, rows]) =>
            `<p><strong>${esc(label)} (${rows.size})</strong></p><ul>${[...rows.values()]
              .map(
                (r) =>
                  `<li>${esc(r.applicantName)} · ${esc(r.h4.gender || "")} · ${esc(new Date(r.stay.fromDate).toISOString().slice(0, 10))} to ${esc(new Date(r.stay.toDate).toISOString().slice(0, 10))} · ${esc(r.status)}</li>`,
              )
              .join("")}</ul>`,
        )
        .join("")
      return {
        to: email,
        subject: `H4 · ${requests.length} intern requests · ${job.note}`,
        body: `<p>${esc(job.note)}.</p>${sections}<p><a href="${esc(`${base}/${role}/intern-accommodation`)}">Open intern accommodation</a></p>`,
      }
    })
  },
  async deliverDigest(job) {
    const failures = []
    try {
      for (const message of await this.digestMessages(job)) {
        const result = await emailService.sendCustomEmail(message)
        if (!result?.success) failures.push(result?.error || "Email delivery failed")
      }
    } catch (e) {
      console.error("H4 digest failed:", e.message)
      failures.push(e.message)
    }
    return failures.join("; ")
  },
  async deliver(r, { skipInternal = false } = {}) {
    let failure = ""
    try {
      const failures = []
      for (const { studentKey, kindLabel, ...message } of await this.messages(r, { skipInternal })) {
        const result = await emailService.sendCustomEmail(message)
        if (!result?.success) failures.push(result?.error || "Email delivery failed")
        else if (studentKey) await owner.setH4StudentLetter(r._id, studentKey)
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
        const failure = r && r.status !== S.DRAFT ? await this.deliver(r, { skipInternal: job.internalDigest }) : ""
        await owner.completeH4Notification(job, failure)
        count++
      } catch (e) {
        await owner.completeH4Notification(job, "Delivery worker failed; retry pending")
      }
    }
    for (let i = 0; i < limit; i++) {
      const job = await owner.claimH4Digest()
      if (!job) break
      await owner.completeH4Digest(job, await this.deliverDigest(job))
      count++
    }
    return count
  },
}
