/**
 * Face-scanner bio-photo requests
 * -------------------------------
 * Students ask to change the photo the face scanners use; Admin or the Dining
 * Office approves it. Approving makes it the student's face in HMS (an upright
 * JPEG, see scanner-faces) and nudges the roster sync, which sends it to every
 * machine within a couple of minutes. A photo that can't be used keeps the
 * request pending with the reason, so the reviewer can reject it.
 *
 * Writes: bioPhotoOwner. Reads: bioPhotoQueries.
 */

import mongoose from "mongoose"
import { success, created, badRequest, notFound, conflict, error as errorResponse } from "../base/index.js"
import { bioPhotoOwner } from "./bioPhotoOwner.service.js"
import { bioPhotoQueries } from "./bioPhotoQueries.service.js"
import { BIO_PHOTO_RULES, prepareMachineFace, validateBioPhotoBuffer } from "./bioPhotoImage.js"
import { fileAccessService } from "../storage/file-access.service.js"
import { isMediaRef } from "../storage/file-ref.service.js"
import { studentProfileQueries } from "../student/studentProfileQueries.service.js"
import { userQueries } from "../user/userQueries.service.js"
import { getStudentScannerStatus, nudgeRosterSync } from "./scanner-users.service.js"
import { recordRequestFace } from "./scanner-faces.service.js"
import { BIO_PHOTO_STATUSES } from "../../models/dining/DiningBioPhotoRequest.model.js"

export const BIO_PHOTO_STORAGE_POLICY = "dining-bio-photos"
const MAX_NOTE = 300
const MAX_COMMENT = 300
const MAX_PAGE_SIZE = 100
const HISTORY_LIMIT = 10
const INVALID_PHOTO = "Please upload your photo again."

const idOf = (value) => String(value?._id || value || "")
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const cleanText = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "")

export const studentRules = () => ({
  formats: BIO_PHOTO_RULES.formats,
  maxSizeMb: BIO_PHOTO_RULES.maxSizeMb,
  minSidePx: BIO_PHOTO_RULES.minSidePx,
})

const serializeRequest = (request) => ({
  id: idOf(request),
  rollNumber: request.rollNumber,
  status: request.status,
  photo: {
    ref: request.photo?.ref || "",
    contentType: request.photo?.contentType || "",
    size: request.photo?.size || 0,
    width: request.photo?.width || 0,
    height: request.photo?.height || 0,
  },
  note: request.note || "",
  reviewComment: request.reviewComment || "",
  reviewedAt: request.reviewedAt || null,
  pushedAt: request.push?.pushedAt || null,
  lastError: request.push?.lastError || "",
  attempts: request.push?.attempts || 0,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
})

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

/**
 * { current, history, rules, scanner }: current = the pending request, else the
 * latest; scanner = whether their photo works on the face scanners (or null).
 */
export const getStudentBioPhoto = async ({ userId }) => {
  const [requests, profile] = await Promise.all([
    bioPhotoQueries.findByStudent(userId, { limit: HISTORY_LIMIT }),
    studentProfileQueries.findByUserId(userId, { select: "rollNumber", lean: true }),
  ])
  const current = requests.find((request) => request.status === "pending") || requests[0] || null
  return success({
    current: current ? serializeRequest(current) : null,
    history: requests.map(serializeRequest),
    rules: studentRules(),
    scanner: await getStudentScannerStatus(profile?.rollNumber).catch(() => null),
  })
}

/**
 * New request from an uploaded photo ref. The ref must be this student's upload
 * under the bio-photo policy; the bytes are re-checked here (format, size,
 * pixels) so nothing the client claims is trusted.
 */
export const createStudentBioPhotoRequest = async ({ userId, payload = {} }) => {
  const photoRef = typeof payload.photoRef === "string" ? payload.photoRef.trim() : ""
  if (!isMediaRef(photoRef)) return badRequest("Upload a photo first.")
  if (payload.note !== undefined && typeof payload.note !== "string") return badRequest("note must be text")

  const profile = await studentProfileQueries.findByUserId(userId, { select: "_id userId rollNumber status", lean: true })
  if (!profile) return notFound("Student profile not found")
  const rollNumber = String(profile.rollNumber || "").trim()
  if (!rollNumber) return badRequest("Your profile has no roll number, so the scanners can't be updated. Please contact the hostel office.")

  const DUPLICATE = "You already have a photo waiting for approval. Cancel it first to send a different one."
  const existing = await bioPhotoQueries.findByStudent(userId, { limit: 1, status: "pending" })
  if (existing.length) return conflict(DUPLICATE)

  let meta
  try {
    meta = await fileAccessService.getMetadata(photoRef)
  } catch {
    return badRequest(INVALID_PHOTO)
  }
  if (meta?.policy !== BIO_PHOTO_STORAGE_POLICY || idOf(meta?.actorId) !== idOf(userId)) return badRequest(INVALID_PHOTO)

  let check
  let buffer
  try {
    ;({ buffer } = await fileAccessService.getBuffer(photoRef))
    check = { ...validateBioPhotoBuffer(buffer), size: buffer.length }
  } catch {
    return badRequest(INVALID_PHOTO)
  }
  if (!check.ok) return badRequest(check.message)
  // The same conversion approval will do, so a photo the machines can't get is caught now.
  const prepared = await prepareMachineFace(buffer)
  if (!prepared.ok) return badRequest(prepared.message)

  const result = await bioPhotoOwner.createRequest({
    studentUserId: userId,
    studentProfileId: profile._id,
    rollNumber,
    photo: { ref: photoRef, name: "", contentType: check.contentType, size: check.size, width: check.width, height: check.height },
    note: cleanText(payload.note, MAX_NOTE),
  })
  if (result.duplicate) return conflict(DUPLICATE)
  return created({ request: serializeRequest(result.request) }, "Sent for approval")
}

export const cancelStudentBioPhotoRequest = async ({ userId, requestId }) => {
  if (!mongoose.isValidObjectId(requestId)) return notFound("Request not found")
  const request = await bioPhotoOwner.cancelPending({ requestId, studentUserId: userId })
  if (!request) {
    const existing = await bioPhotoQueries.findById(requestId)
    if (!existing || idOf(existing.studentUserId) !== idOf(userId)) return notFound("Request not found")
    return conflict("Only a request that is still waiting can be cancelled.")
  }
  return success({ request: serializeRequest(request) })
}

// ---------------------------------------------------------------------------
// Admin + Dining Office
// ---------------------------------------------------------------------------

const studentSummary = (profile) => {
  const user = profile?.userId || {}
  return {
    name: user.name || "",
    email: user.email || "",
    profileImage: user.profileImage || "",
    hostel: profile?.currentRoomAllocation?.hostelId?.name || "",
  }
}

const reviewerName = (users, id) => (id ? users.get(idOf(id))?.name || "" : "")

/** Rows enriched with the student's name, photo and hostel, plus the reviewer's name. */
const enrich = async (requests) => {
  const studentIds = [...new Set(requests.map((request) => idOf(request.studentUserId)))]
  const reviewerIds = [...new Set(requests.map((request) => idOf(request.reviewedBy)).filter(Boolean))]
  const [profiles, reviewers] = await Promise.all([
    studentIds.length ? studentProfileQueries.findDiningStudentDetailsByUserIds(studentIds) : [],
    reviewerIds.length ? userQueries.findUsers({ _id: { $in: reviewerIds } }, { select: "name", lean: true }) : [],
  ])
  const profileByUser = new Map(profiles.map((profile) => [idOf(profile.userId), profile]))
  const reviewerById = new Map(reviewers.map((user) => [idOf(user), user]))
  return requests.map((request) => ({
    ...serializeRequest(request),
    studentUserId: idOf(request.studentUserId),
    student: studentSummary(profileByUser.get(idOf(request.studentUserId))),
    reviewedBy: reviewerName(reviewerById, request.reviewedBy),
  }))
}

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return max ? Math.min(parsed, max) : parsed
}

export const listBioPhotoRequests = async ({ query = {} }) => {
  const status = query.status === undefined || query.status === "" ? "pending" : query.status
  if (!BIO_PHOTO_STATUSES.includes(status)) return badRequest(`status must be one of ${BIO_PHOTO_STATUSES.join(", ")}`)
  const page = parsePositiveInt(query.page, 1)
  const limit = parsePositiveInt(query.limit, 25, MAX_PAGE_SIZE)
  const search = typeof query.search === "string" ? query.search.trim().slice(0, 60) : ""

  const filter = { status }
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i")
    const users = await userQueries.findUsers({ name: pattern, role: "Student" }, { select: "_id", lean: true, limit: 200 })
    filter.$or = [{ rollNumber: pattern }, { studentUserId: { $in: users.map((user) => user._id) } }]
  }

  const [{ items, total }, counts] = await Promise.all([
    bioPhotoQueries.findPage(filter, { page, limit, oldestFirst: status === "pending" }),
    bioPhotoQueries.countByStatus(),
  ])
  return success({
    items: await enrich(items),
    total,
    page,
    limit,
    counts,
  })
}

const loadPending = async (requestId) => {
  if (!mongoose.isValidObjectId(requestId)) return { response: notFound("Request not found") }
  const request = await bioPhotoQueries.findById(requestId)
  if (!request) return { response: notFound("Request not found") }
  if (request.status !== "pending") return { response: conflict(`This request is already ${request.status}.`) }
  return { request }
}

/**
 * Approve = make it the student's scanner face. One approval per request at a
 * time (claim). Success → approved and sent to the machines by the roster sync.
 * A photo that can't be used → still pending with lastError, 422.
 */
export const approveBioPhotoRequest = async ({ requestId, reviewer }) => {
  const loaded = await loadPending(requestId)
  if (loaded.response) return loaded.response

  const claimed = await bioPhotoOwner.claimForPush(requestId)
  if (!claimed) {
    const latest = await bioPhotoQueries.findById(requestId)
    if (latest?.status !== "pending") return conflict(`This request is already ${latest?.status || "closed"}.`)
    return conflict("This photo is being sent to the scanners right now. Refresh in a moment.")
  }
  const lockedAt = claimed.push.lockedAt

  const [student] = await enrich([claimed])
  let stored
  try {
    stored = await recordRequestFace({
      rollNumber: claimed.rollNumber,
      photo: claimed.photo,
      actorId: idOf(reviewer._id),
      fields: { studentUserId: claimed.studentUserId, ...(student.student?.name ? { name: student.student.name } : {}) },
    })
  } catch {
    stored = { ok: false, problem: "Couldn't save the photo. Try again." }
  }
  if (!stored.ok) {
    await bioPhotoOwner.markPushFailed({ requestId, lockedAt, error: stored.problem })
    return errorResponse(stored.problem, 422)
  }

  const approved = await bioPhotoOwner.markPushed({ requestId, lockedAt, reviewerId: reviewer._id })
  if (!approved) return conflict("The photo was saved, but the request changed meanwhile. Refresh the page.")
  nudgeRosterSync()
  const [row] = await enrich([approved])
  return success({ request: row }, 200, "Approved. The face scanners get it within a couple of minutes.")
}

export const rejectBioPhotoRequest = async ({ requestId, reviewer, body = {} }) => {
  const comment = cleanText(body.comment, MAX_COMMENT + 1)
  if (!comment) return badRequest("Give a reason so the student knows what to fix.")
  if (comment.length > MAX_COMMENT) return badRequest(`The reason must be ${MAX_COMMENT} characters or fewer.`)

  const loaded = await loadPending(requestId)
  if (loaded.response) return loaded.response

  const rejected = await bioPhotoOwner.reject({ requestId, reviewerId: reviewer._id, comment })
  if (!rejected) {
    const latest = await bioPhotoQueries.findById(requestId)
    if (latest?.status === "pending") return conflict("This photo is being sent to the scanners right now. Refresh in a moment.")
    return conflict(`This request is already ${latest?.status || "closed"}.`)
  }
  const [row] = await enrich([rejected])
  return success({ request: row }, 200, "Rejected")
}
