import { success, badRequest, forbidden, notFound } from "../../../../services/base/index.js"
import { accommodationQueries as queries } from "../../../../services/accommodation/accommodationQueries.service.js"
import {
  findActionLinkTokenByRawToken,
  isActionLinkTokenExpired,
} from "../../../../services/action-links/action-link-token.service.js"
import { storageClient } from "../../../../services/storage/storage.client.js"
import { fileAccessService } from "../../../../services/storage/file-access.service.js"
import { hostelQueries } from "../../../../services/hostel/hostelQueries.service.js"
import { H4_TOKEN_TYPE, h4Notifications } from "./h4.notifications.js"
import { h4Service } from "./h4.service.js"
import { S, validId, isCreator, isFaculty, isOffice, isAccounts, freshUser, mutate, audit } from "./h4.helpers.js"

export const resolveAccess = async (raw) => {
  if (typeof raw !== "string" || raw.length > 128) return null
  const token = await findActionLinkTokenByRawToken(raw, { type: H4_TOKEN_TYPE })
  // Only the student gets a link now; they pay and upload the mess photo.
  if (!token || isActionLinkTokenExpired(token) || token.payload?.purpose !== "intern") return null
  const r = await queries.findH4ById(token.subjectId, { lean: true })
  if (!r || [S.DRAFT, S.REJECTED, S.CANCELLED].includes(r.status) || !r.allotment?.hostelId) return null
  if (r.applicantEmail !== token.recipientEmail) return null
  return { request: r, user: { external: "intern", email: r.applicantEmail }, expiresAt: token.expiresAt }
}
export const h4Access = {
  async response(result, access) {
    return result.success ? this.view({ ...access, request: result.data }) : result
  },
  async view(access) {
    const r = access.request
    const hostel = await hostelQueries.findHostelById(r.allotment.hostelId)
    const rooms = r.rooms.length ? await hostelQueries.findRoomsByIds(r.rooms.map((a) => a.roomId)) : []
    const payment = (p) => ({
      _id: p._id,
      amount: p.amount,
      dailyRate: p.dailyRate,
      days: p.days,
      amountOverridden: p.amountOverridden,
      status: p.status,
      label: p.label,
      utr: p.utr,
      paidAt: p.paidAt,
      note: p.note,
      remarks: p.remarks,
      paymentLink: p.paymentLink,
    })
    const room = rooms[0]
      ? { roomNumber: rooms[0].roomNumber, unitId: { unitNumber: rooms[0].unitId?.unitNumber || "" } }
      : null
    const data = {
      _id: r._id,
      applicantName: r.applicantName,
      status: r.status,
      stay: r.stay,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      quote: { subtotal: r.quote?.subtotal, gstPercentage: r.quote?.gstPercentage, gstAmount: r.quote?.gstAmount, total: r.quote?.total },
      h4: {
        revision: r.h4.revision,
        mess: r.h4.mess,
        messCharge: r.h4.messCharge || null,
        caterer: r.h4.caterer ? { name: r.h4.caterer.name } : null,
        messPhoto: r.h4.messPhoto
          ? { status: r.h4.messPhoto.status, note: r.h4.messPhoto.note, submittedAt: r.h4.messPhoto.submittedAt, hasFile: !!r.h4.messPhoto.fileRef }
          : null,
        amendment: r.h4.amendment,
      },
      hostel: hostel ? { name: hostel.name } : null,
      room,
      timeline: r.timeline.map((t) => ({ status: t.status, at: t.at })),
      purpose: access.user.external,
      expiresAt: access.expiresAt,
      payment: payment(r.payment),
      additionalPayments: r.additionalPayments.map(payment),
      invoice: r.invoice?.generatedAt ? { number: r.invoice.number, generatedAt: r.invoice.generatedAt } : null,
      hasQr: !!r.payment.qrRef,
    }
    return success(data)
  },
  async upload(id, file, user, revision) {
    if (!validId(id) || !Number.isInteger(revision)) return badRequest("Refresh the request before uploading")
    const r = await queries.findH4ById(id, { lean: true })
    if (!r) return notFound("H4 request")
    const u = user.external ? user : await freshUser(user)
    if (!u || !(u.external === "intern" || isCreator(r, u))) return forbidden()
    if ([S.DRAFT, S.REJECTED, S.CANCELLED, S.INVOICED].includes(r.status) || !r.allotment?.hostelId)
      return badRequest("There is no published accommodation bill")
    if (r.h4.revision !== revision) return badRequest("This request changed. Refresh before uploading.")
    const png = file?.buffer?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpg = file?.buffer?.[0] === 255 && file?.buffer?.[1] === 216 && file?.buffer?.[2] === 255
    if (!file || file.size > 5 * 1024 * 1024 || !(png || jpg)) return badRequest("Upload a PNG or JPG image up to 5 MB")
    const stored = await storageClient.upload({
      file: { ...file, mimetype: png ? "image/png" : "image/jpeg" },
      policy: "payment-screenshot",
      actorId: r.requesterUserId,
      actorRole: "System",
      sourceService: "intern-accommodation",
      entityHint: String(r._id),
      timeoutMs: 15000,
    })
    const ref = stored?.file_ref || stored?.fileRef || stored?.data?.fileRef
    if (!ref) return badRequest("Proof upload failed")
    const result = await mutate(
      id,
      { revision },
      u,
      (request) => {
        if (request.h4.proofRefs.length >= 20) request.h4.proofRefs.shift()
        request.h4.proofRefs.push(ref)
        audit(request, u, "Payment proof uploaded")
      },
      { notify: false },
    )
    return result.success ? success({ fileRef: ref, revision: result.data.h4.revision }) : result
  },
  // Student's mess photo, from the access link after Accounts picks the caterer.
  // Stored for CW Office's manual check only; nothing is sent to the scanners.
  async messPhoto(access, file, revision) {
    const r = access.request
    if (!Number.isInteger(revision)) return badRequest("Refresh the page before uploading")
    if (r.h4.mess !== "with" || !r.h4.caterer) return badRequest("The mess photo opens once your mess is assigned")
    if (!["Pending", "Rejected", "Submitted"].includes(r.h4.messPhoto?.status))
      return badRequest("Your mess photo is already approved")
    if ([S.CHECKED_OUT, S.INVOICED].includes(r.status)) return badRequest("This stay is closed")
    if (r.h4.revision !== revision) return badRequest("This request changed. Refresh before uploading.")
    const png = file?.buffer?.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpg = file?.buffer?.[0] === 255 && file?.buffer?.[1] === 216 && file?.buffer?.[2] === 255
    if (!file || file.size > 5 * 1024 * 1024 || !(png || jpg)) return badRequest("Upload a PNG or JPG photo up to 5 MB")
    const stored = await storageClient.upload({
      file: { ...file, mimetype: png ? "image/png" : "image/jpeg" },
      policy: "dining-bio-photo",
      actorId: r.requesterUserId,
      actorRole: "System",
      sourceService: "intern-accommodation",
      entityHint: String(r._id),
      timeoutMs: 15000,
    })
    const ref = stored?.file_ref || stored?.fileRef || stored?.data?.fileRef
    if (!ref) return badRequest("Photo upload failed")
    const result = await mutate(String(r._id), { revision }, access.user, (request) => {
      if (request.h4.mess !== "with" || !request.h4.caterer || request.h4.messPhoto?.status === "Approved")
        return badRequest("The mess photo cannot be changed now")
      request.h4.messPhoto = { status: "Submitted", fileRef: ref, submittedAt: new Date(), reviewedBy: null, reviewedAt: null, note: "" }
      audit(request, access.user, "Mess photo submitted by the student")
    })
    if (result.success) await h4Notifications.handoff(result.data)
    return this.response(result, access)
  },
  async messPhotoFile(access) {
    const ref = access.request.h4.messPhoto?.fileRef
    if (!ref) return notFound("Mess photo")
    const file = await fileAccessService.getBuffer(ref)
    return success({ ...file, contentType: file.contentType || "image/jpeg", filename: "mess-photo" })
  },
  async resend(id, body, user) {
    if (!validId(id)) return badRequest("Invalid request ID")
    const r = await queries.findH4ById(id, { lean: true })
    if (!r) return notFound("H4 request")
    const u = await freshUser(user)
    if (!u || !(isCreator(r, u) || isOffice(u) || isFaculty(r, u))) return forbidden()
    if ([S.DRAFT, S.CANCELLED, S.REJECTED].includes(r.status))
      return badRequest("This request cannot send access links")
    if (body.rotate === true) await h4Notifications.invalidateAccess(id)
    await h4Notifications.handoff(r, { resendLinks: true })
    return success({ queued: true }, 200, "Notifications queued")
  },
  async invoice(access) {
    return h4Service.invoice(String(access.request._id), access.user, true)
  },
  async qr(access) {
    if (!access.request.payment?.qrRef) return notFound("Payment QR")
    const file = await fileAccessService.getBuffer(access.request.payment.qrRef)
    const contentType = file.contentType || (file.buffer[0] === 137 ? "image/png" : "image/jpeg")
    return success({ ...file, contentType, filename: "payment-qr" })
  },
  async requestQr(id, user) {
    const u = await freshUser(user)
    const result = await h4Service.get(id, u)
    if (!result.success) return result
    if (!(isCreator(result.data, u) || isFaculty(result.data, u) || isOffice(u) || isAccounts(u))) return forbidden()
    return this.qr({ request: result.data, user: { external: "intern" } })
  },
}
