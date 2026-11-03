/**
 * Scanner faces — the face photo HMS keeps for each person and sends to the
 * face machines.
 *
 * - storeScannerFace: turn a photo into what the machines take (upright JPEG,
 *   see prepareMachineFace) → upload to HMS storage (policy dining-bio-photo,
 *   kept forever) → remember it on the DiningScannerUser row (face.*). The
 *   roster sync then sends it to every machine.
 * - Machines download a face from a RELATIVE url HMS puts in the BIOPHOTO
 *   command: iclock/file/biophoto/<token>/<roll>.jpg. The token is an HMAC of
 *   the roll + stored file, so the url can't be guessed and stops working when
 *   the photo changes.
 * - Faces with source "easywdms" were copied once from the old scanner software
 *   when HMS took over the machines.
 */
import crypto from "node:crypto"
import { logger } from "../base/Logger.js"
import { bioPhotoOwner } from "./bioPhotoOwner.service.js"
import { bioPhotoQueries } from "./bioPhotoQueries.service.js"
import { prepareMachineFace } from "./bioPhotoImage.js"
import { fileAccessService } from "../storage/file-access.service.js"
import { storageClient } from "../storage/storage.client.js"

// ---- Tokens ----------------------------------------------------------------

const tokenSecret = () => process.env.ICLOCK_FILE_SECRET || process.env.SESSION_SECRET || "hms-iclock"

/** 32 hex chars bound to (roll, stored file). */
export const faceToken = (rollNumber, ref) =>
  crypto.createHmac("sha256", tokenSecret()).update(`${rollNumber}\n${ref}`).digest("hex").slice(0, 32)

const sameToken = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Relative url for a BIOPHOTO command, or "" when HMS has no usable face for this roll. */
export const faceUrlFor = (row) => {
  const ref = row?.face?.ref
  if (!ref || row.face.contentType !== "image/jpeg") return ""
  return `iclock/file/biophoto/${faceToken(row.rollNumber, ref)}/${row.rollNumber}.jpg`
}

/**
 * What the iclock receiver serves for GET /iclock/file/biophoto/<token>/<roll>.jpg.
 * null for a wrong token, unknown roll or missing file (the receiver answers 404).
 */
export const readFaceForMachine = async ({ token, rollNumber }) => {
  const roll = String(rollNumber || "").trim()
  if (!roll || !/^[0-9a-f]{32}$/.test(String(token || ""))) return null
  const row = await bioPhotoQueries.findScannerUser(roll)
  const ref = row?.face?.ref
  if (!ref || !sameToken(faceToken(roll, ref), token)) return null
  try {
    const { buffer } = await fileAccessService.getBuffer(ref)
    return { buffer, contentType: row.face.contentType || "image/jpeg" }
  } catch (caught) {
    logger.warn?.(`[scanner-faces] couldn't read face for ${roll}: ${caught?.message || caught}`)
    return null
  }
}

// ---- Storing ---------------------------------------------------------------

/**
 * Store `buffer` as the face for `rollNumber` (source: "request" | "profile").
 * Returns { ok: true, face } or { ok: false, problem } (a photo that can't be
 * used; nothing is changed then).
 */
export const storeScannerFace = async ({ rollNumber, buffer, source, actorId = "", fields = {} }) => {
  const prepared = await prepareMachineFace(buffer)
  if (!prepared.ok) return { ok: false, problem: prepared.message }

  const stored = await storageClient.upload({
    file: { buffer: prepared.buffer, mimetype: prepared.contentType, originalname: `${rollNumber}.jpg` },
    policy: "dining-bio-photo",
    actorId: String(actorId || ""),
    actorRole: "Admin",
    entityHint: `scanner-face:${rollNumber}`,
    sourceService: "hms-backend",
  })
  const ref = stored.file_ref || stored.fileRef
  if (!ref) return { ok: false, problem: "Storage didn't return a file reference" }

  const face = {
    ref,
    contentType: prepared.contentType,
    size: prepared.buffer.length,
    width: prepared.width,
    height: prepared.height,
    sha256: crypto.createHash("sha256").update(prepared.buffer).digest("hex"),
    source,
    sourceKey: "",
    storedAt: new Date(),
    problem: "",
  }
  await bioPhotoOwner.upsertScannerUser(rollNumber, { ...fields, face })
  return { ok: true, face }
}

/** An approved student request: its photo becomes the student's face. Same result shape as storeScannerFace. */
export const recordRequestFace = async ({ rollNumber, photo, actorId = "", fields = {} }) => {
  if (!rollNumber || !photo?.ref) return { ok: false, problem: "The request has no photo" }
  let buffer
  try {
    ;({ buffer } = await fileAccessService.getBuffer(photo.ref))
  } catch (caught) {
    logger.warn?.(`[scanner-faces] couldn't read request photo for ${rollNumber}: ${caught?.message || caught}`)
    return { ok: false, problem: "Couldn't read the photo from storage" }
  }
  return storeScannerFace({ rollNumber, buffer, source: "request", actorId, fields })
}

/** The stored face bytes for display, or null. */
export const readFace = async (rollNumber) => {
  const row = await bioPhotoQueries.findScannerUser(String(rollNumber || "").trim())
  if (!row?.face?.ref) return null
  try {
    const { buffer } = await fileAccessService.getBuffer(row.face.ref)
    return { buffer, contentType: row.face.contentType || "image/jpeg" }
  } catch {
    return null
  }
}

export const getFaceSummary = async () => bioPhotoQueries.countFaces()
