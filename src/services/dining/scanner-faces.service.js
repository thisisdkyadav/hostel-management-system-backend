/**
 * Scanner faces — the face photo HMS keeps for each person, so the machines can
 * be fed from HMS instead of EasyWDMS.
 *
 * - storeScannerFace: validate → upload to HMS storage → remember on the
 *   DiningScannerUser row (face.*).
 * - importFacesFromEasyWdms: one-off bulk copy of EasyWDMS's bio photos, then
 *   incremental (only photos whose EasyWDMS path/registration time changed).
 *   A face that came from a student request or profile photo is never replaced.
 * - Machines download a face from a RELATIVE url HMS puts in the BIOPHOTO
 *   command: iclock/file/biophoto/<token>/<roll>.jpg. The token is an HMAC of
 *   the roll + stored file, so the url can't be guessed and stops working when
 *   the photo changes.
 */
import crypto from "node:crypto"
import { logger } from "../base/Logger.js"
import { bioPhotoOwner } from "./bioPhotoOwner.service.js"
import { bioPhotoQueries } from "./bioPhotoQueries.service.js"
import { validateBioPhotoBuffer } from "./bioPhotoImage.js"
import { fileAccessService } from "../storage/file-access.service.js"
import { storageClient } from "../storage/storage.client.js"
import { configOwner } from "../config/configOwner.service.js"
import { configQueries } from "../config/configQueries.service.js"
import { withLock, LOCK_NOT_ACQUIRED } from "../lock/distributedLock.js"
import { getEasyWdmsClient } from "../easywdms/easywdms.client.js"

export const FACE_IMPORT_CONFIG_KEY = "diningScannerFaceImport"
const FACE_IMPORT_LOCK = "lock:dining-scanner-face-import"
const IMPORT_BATCH = 200
const IMPORT_CONCURRENCY = 4

const readState = async () => (await configQueries.findByKeyLean(FACE_IMPORT_CONFIG_KEY))?.value || null
const writeState = (value) => configOwner.upsertConfig({ key: FACE_IMPORT_CONFIG_KEY }, { key: FACE_IMPORT_CONFIG_KEY, value })

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

const faceFromCheck = ({ ref, buffer, check, source, sourceKey }) => ({
  ref,
  contentType: check.contentType,
  size: buffer.length,
  width: check.width || 0,
  height: check.height || 0,
  sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  source,
  sourceKey,
  storedAt: new Date(),
  problem: "",
})

/** Validate and store a face for `rollNumber`. Returns { ok, face } or { ok:false, problem }. */
export const storeScannerFace = async ({ rollNumber, buffer, source, sourceKey = "", actorId = "" }) => {
  // EasyWDMS photos are already working on the machines: keep them even if they're smaller than the upload rules.
  const check = validateBioPhotoBuffer(buffer, { sizeRules: source !== "easywdms" })
  if (!check.ok) return { ok: false, problem: check.message }

  const extension = check.contentType === "image/png" ? "png" : "jpg"
  const stored = await storageClient.upload({
    file: { buffer, mimetype: check.contentType, originalname: `${rollNumber}.${extension}` },
    policy: "dining-bio-photo",
    actorId: String(actorId || ""),
    actorRole: "Admin",
    entityHint: `scanner-face:${rollNumber}`,
    sourceService: "hms-backend",
  })
  const ref = stored.file_ref || stored.fileRef
  if (!ref) return { ok: false, problem: "Storage didn't return a file reference" }

  const face = faceFromCheck({ ref, buffer, check, source, sourceKey })
  await bioPhotoOwner.upsertScannerUser(rollNumber, { face })
  return { ok: true, face }
}

/** An approved student request: its photo is already in HMS storage — just point at it. */
export const recordRequestFace = async ({ rollNumber, photo }) => {
  if (!rollNumber || !photo?.ref) return
  try {
    const { buffer } = await fileAccessService.getBuffer(photo.ref)
    const check = validateBioPhotoBuffer(buffer)
    if (!check.ok) return
    await bioPhotoOwner.upsertScannerUser(rollNumber, {
      face: faceFromCheck({ ref: photo.ref, buffer, check, source: "request", sourceKey: "" }),
    })
  } catch (caught) {
    logger.warn?.(`[scanner-faces] couldn't record request face for ${rollNumber}: ${caught?.message || caught}`)
  }
}

// ---- EasyWDMS import -------------------------------------------------------

const mapLimit = async (items, limit, worker) => {
  let next = 0
  const run = async () => {
    while (next < items.length) await worker(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
}

const importOne = async (client, row, totals) => {
  try {
    const file = await client.fetchBioPhotoFile(row.bioPhoto.path)
    if (!file?.buffer) throw new Error(`EasyWDMS has no file at ${row.bioPhoto.path}`)
    const buffer = file.buffer
    const result = await storeScannerFace({ rollNumber: row.rollNumber, buffer, source: "easywdms", sourceKey: row._key })
    if (result.ok) totals.stored++
    else {
      totals.unusable++
      // Remember the key too, so an unusable photo isn't re-downloaded every run.
      await bioPhotoOwner.upsertScannerUser(row.rollNumber, { "face.problem": result.problem, "face.sourceKey": row._key, "face.source": "easywdms" })
    }
  } catch (caught) {
    totals.failed++
    totals.lastError = String(caught?.message || caught).slice(0, 300)
  }
}

const runImport = async ({ trigger, maxRows }) => {
  const client = getEasyWdmsClient()
  if (!client.configured) throw new Error("EasyWDMS isn't configured")
  const totals = { stored: 0, unusable: 0, failed: 0, lastError: "" }
  const startedAt = new Date()
  await writeState({ running: true, trigger, startedAt, finishedAt: null, ...totals })

  let processed = 0
  for (;;) {
    const batch = await bioPhotoQueries.findFaceImportCandidates({ limit: Math.min(IMPORT_BATCH, maxRows - processed) })
    if (!batch.length) break
    await mapLimit(batch, IMPORT_CONCURRENCY, (row) => importOne(client, row, totals))
    processed += batch.length
    await writeState({ running: true, trigger, startedAt, finishedAt: null, processed, ...totals })
    // Failed rows stay candidates; stop rather than loop on them forever.
    if (totals.failed && totals.failed >= batch.length) break
    if (processed >= maxRows) break
  }

  const state = { running: false, trigger, startedAt, finishedAt: new Date(), processed, ...totals }
  await writeState(state)
  logger.info?.(`[scanner-faces] import (${trigger}): ${totals.stored} stored, ${totals.unusable} unusable, ${totals.failed} failed`)
  return state
}

/** Copy EasyWDMS bio photos into HMS storage. Returns the final state, or { running: true } if one is in progress. */
export const importFacesFromEasyWdms = async ({ trigger = "manual", maxRows = 100_000 } = {}) => {
  const result = await withLock(FACE_IMPORT_LOCK, 2 * 60 * 60, () => runImport({ trigger, maxRows }))
  if (result === LOCK_NOT_ACQUIRED) return { running: true }
  return result
}

/** Start the import without waiting (for the HTTP endpoint). */
export const startFaceImport = ({ trigger = "manual" } = {}) => {
  importFacesFromEasyWdms({ trigger }).catch(async (caught) => {
    logger.error?.(`[scanner-faces] import failed: ${caught?.message || caught}`)
    const state = (await readState()) || {}
    await writeState({ ...state, running: false, finishedAt: new Date(), lastError: String(caught?.message || caught) })
  })
}

export const getFaceSummary = async () => {
  const [counts, job] = await Promise.all([bioPhotoQueries.countFaces(), readState()])
  return { ...counts, job }
}
