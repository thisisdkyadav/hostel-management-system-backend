/**
 * Migrate legacy `/uploads/...` file refs into storage-backend `media://` refs.
 *
 * Only paths still referenced from Mongo are uploaded (orphans on disk stay put).
 * Original files are never deleted. Dry run by default.
 * Every rewrite is recorded in a JSON map so Mongo can be pointed back at the
 * old `/uploads/...` paths.
 *
 *   node scripts/migrate_legacy_uploads_to_storage.mjs
 *   node scripts/migrate_legacy_uploads_to_storage.mjs --apply
 *   node scripts/migrate_legacy_uploads_to_storage.mjs --apply --limit=25
 *   node scripts/migrate_legacy_uploads_to_storage.mjs --collection=User
 *   node scripts/migrate_legacy_uploads_to_storage.mjs --apply --map=./legacy-map.json
 *   node scripts/migrate_legacy_uploads_to_storage.mjs --revert=./legacy-map.json
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { env } from "../src/config/env.config.js"
import { storageClient } from "../src/services/storage/storage.client.js"
import { resolveLegacyUploadPath } from "../src/services/storage/file-ref.service.js"
import {
  User,
  StudentProfile,
  VisitorRequest,
  Certificate,
  Complaint,
  LostAndFound,
  DisCoProcessCase,
  ElectionNomination,
  PorRequest,
  OverallBestPerformerApplication,
  EventProposal,
  EventExpense,
  MegaEventOccurrence,
  ApprovalLog,
  Configuration,
  AccommodationRequest,
  ExpenditureOccurrence,
} from "../src/models/index.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const UPLOADS_ROOT = path.resolve(__dirname, "../uploads")

const APPLY = process.argv.includes("--apply")
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))
const LIMIT = limitArg ? Number(limitArg.slice("--limit=".length)) : 0
const collectionArg = process.argv.find((arg) => arg.startsWith("--collection="))
const ONLY_COLLECTION = collectionArg ? collectionArg.slice("--collection=".length) : ""
const mapArg = process.argv.find((arg) => arg.startsWith("--map="))
const revertArg = process.argv.find((arg) => arg.startsWith("--revert="))
const REVERT_MAP_PATH = revertArg ? path.resolve(revertArg.slice("--revert=".length)) : ""
const MAP_DIR = path.join(__dirname, "migration-maps")

const defaultMapPath = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return path.join(MAP_DIR, `legacy-uploads-${stamp}.json`)
}

const MAP_PATH = mapArg ? path.resolve(mapArg.slice("--map=".length)) : defaultMapPath()

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/

const FOLDER_TO_POLICY = {
  "profile-images": "profile-image",
  "student-id-cards": "student-id-card",
  "h2-forms": "h2-form",
  "event-proposal-docs": "event-proposal-pdf",
  "event-chief-guest-docs": "event-chief-guest-pdf",
  "event-bill-docs": "event-bill-pdf",
  "event-report-docs": "event-report-pdf",
  "disco-process-docs": "disco-process-pdf",
  "payment-screenshots": "payment-screenshot",
  "lost-and-found": "lost-and-found-image",
  certificates: "certificate",
  "election-nomination-docs": "election-nomination-document",
  "overall-best-performer-proofs": "overall-best-performer-proof-pdf",
  "por-documents": "por-document-pdf",
  "signature-images": "signature-image",
}

const MIME_BY_EXT = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

const toId = (value) => {
  if (!value) return ""
  return String(value).trim()
}

const normalizeLegacyRef = (value) => {
  const raw = String(value || "").trim()
  if (!raw) return null
  const hosted = raw.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/i)
  const candidate = hosted ? hosted[1] : raw
  if (!candidate.startsWith("/uploads/")) return null
  return candidate.split("?")[0]
}

const policyFromRef = (legacyRef) => {
  const relative = legacyRef.slice("/uploads/".length)
  const folder = relative.split("/")[0]
  return FOLDER_TO_POLICY[folder] || null
}

const mimeFromName = (filename) => {
  const ext = path.extname(filename).slice(1).toLowerCase()
  return MIME_BY_EXT[ext] || "application/octet-stream"
}

const parseFilenameActor = (legacyRef) => {
  const base = path.basename(legacyRef)
  const match = base.match(/^([a-fA-F0-9]{24})(?:-(front|back))?-/)
  if (!match) return { userId: "", side: "" }
  return { userId: match[1], side: match[2] || "" }
}

const sideFromPath = (mongoPath) => {
  if (/\.front$/.test(mongoPath) || mongoPath.endsWith("idCard.front")) return "front"
  if (/\.back$/.test(mongoPath) || mongoPath.endsWith("idCard.back")) return "back"
  return ""
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !value._bsontype

const collectLegacyHits = (node, prefix = "") => {
  const hits = []
  if (typeof node === "string") {
    const legacyRef = normalizeLegacyRef(node)
    if (legacyRef) hits.push({ mongoPath: prefix, legacyRef })
    return hits
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      hits.push(...collectLegacyHits(item, prefix ? `${prefix}.${index}` : String(index)))
    })
    return hits
  }
  if (isPlainObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "_id" || key === "__v") continue
      hits.push(...collectLegacyHits(value, prefix ? `${prefix}.${key}` : key))
    }
  }
  return hits
}

const legacyFilter = (matchPaths) => {
  if (!matchPaths.length) return {}
  return {
    $or: matchPaths.map((field) => ({ [field]: /\/uploads\// })),
  }
}

const pickDocActorId = (doc, source) => {
  for (const key of source.actorKeys || []) {
    const value = toId(doc[key])
    if (OBJECT_ID_RE.test(value)) return value
  }
  if (source.actorIsSelf) return toId(doc._id)
  return ""
}

const SOURCES = [
  {
    name: "User",
    Model: User,
    matchPaths: ["profileImage", "signature.imageRef"],
    actorIsSelf: true,
    actorRoleFromDoc: true,
  },
  {
    name: "StudentProfile",
    Model: StudentProfile,
    matchPaths: ["idCard.front", "idCard.back"],
    actorKeys: ["userId"],
  },
  {
    name: "VisitorRequest",
    Model: VisitorRequest,
    matchPaths: ["h2FormUrl", "paymentInfo.screenshot"],
    actorKeys: ["userId"],
  },
  {
    name: "Certificate",
    Model: Certificate,
    matchPaths: ["certificateUrl"],
    actorKeys: ["userId"],
  },
  {
    name: "Complaint",
    Model: Complaint,
    matchPaths: ["attachments"],
    actorKeys: ["userId"],
  },
  {
    name: "LostAndFound",
    Model: LostAndFound,
    matchPaths: ["images"],
    defaultRole: "Admin",
  },
  {
    name: "DisCoProcessCase",
    Model: DisCoProcessCase,
    matchPaths: [
      "complaintPdfUrl",
      "statements.statementPdfUrl",
      "evidenceDocuments.pdfUrl",
      "extraDocuments.pdfUrl",
      "emailLogs.attachments.fileUrl",
      "committeeMeetingMinutes.pdfUrl",
    ],
    actorKeys: ["submittedBy"],
    defaultRole: "Admin",
  },
  {
    name: "ElectionNomination",
    Model: ElectionNomination,
    matchPaths: [
      "gradeCardUrl",
      "identityCardUrl",
      "manifestoUrl",
      "porDocumentUrl",
      "attachments.url",
      "proposerEntries.profileImage",
      "seconderEntries.profileImage",
    ],
    actorKeys: ["candidateUserId"],
  },
  {
    name: "PorRequest",
    Model: PorRequest,
    matchPaths: ["supportingDocumentUrl"],
    actorKeys: ["submittedBy"],
  },
  {
    name: "OverallBestPerformerApplication",
    Model: OverallBestPerformerApplication,
    matchPaths: [
      "coursework.proofs.url",
      "projectThesis.btpAwardProofs.url",
      "projectThesis.projectGradeProofs.url",
      "projectThesis.publicationItems.proofs.url",
      "projectThesis.technologyTransferItems.proofs.url",
      "responsibilityItems.proofs.url",
      "awardItems.proofs.url",
      "culturalItems.proofs.url",
      "scienceTechnologyItems.proofs.url",
      "gamesSportsItems.proofs.url",
      "coCurricularItems.proofs.url",
    ],
    actorKeys: ["studentUserId"],
  },
  {
    name: "EventProposal",
    Model: EventProposal,
    matchPaths: ["proposalDocumentUrl", "chiefGuestDocumentUrl"],
    actorKeys: ["submittedBy"],
    defaultRole: "Gymkhana",
  },
  {
    name: "EventExpense",
    Model: EventExpense,
    matchPaths: ["eventReportDocumentUrl", "bills.attachments.url"],
    actorKeys: ["submittedBy"],
    defaultRole: "Gymkhana",
  },
  {
    name: "MegaEventOccurrence",
    Model: MegaEventOccurrence,
    matchPaths: [
      "proposal.proposalDocumentUrl",
      "proposal.chiefGuestDocumentUrl",
      "expense.eventReportDocumentUrl",
      "expense.bills.attachments.url",
    ],
    actorKeys: [],
    defaultRole: "Gymkhana",
  },
  {
    name: "ApprovalLog",
    Model: ApprovalLog,
    matchPaths: ["attachments.url"],
    actorKeys: ["performedBy"],
  },
  {
    name: "Configuration",
    Model: Configuration,
    matchPaths: ["value.defaultPaymentQR", "value.logoRef"],
    defaultRole: "Admin",
  },
  {
    name: "AccommodationRequest",
    Model: AccommodationRequest,
    matchPaths: [
      "addressProof.fileRef",
      "payment.qrRef",
      "payment.screenshotFileRef",
      "additionalPayments.screenshotFileRef",
      "invoice.pdfFileRef",
    ],
    actorKeys: ["requesterUserId"],
  },
  {
    name: "ExpenditureOccurrence",
    Model: ExpenditureOccurrence,
    matchPaths: [
      "documents.fileRef",
      "expenses.attachments.fileRef",
      "expenses.bills.attachments.fileRef",
      "payments.attachments.fileRef",
    ],
    actorKeys: ["createdBy"],
    defaultRole: "Admin",
  },
]

const sourceByName = new Map()
for (const source of SOURCES) {
  sourceByName.set(source.name, source)
}

const stats = {
  docs: 0,
  hits: 0,
  uploaded: 0,
  reused: 0,
  rewritten: 0,
  missing: 0,
  invalidPath: 0,
  unknownPolicy: 0,
  uploadFailed: 0,
}

const samples = {
  missing: [],
  invalidPath: [],
  unknownPolicy: [],
  uploadFailed: [],
}

const remember = (bucket, message) => {
  stats[bucket] += 1
  if (samples[bucket].length < 12) samples[bucket].push(message)
}

const userCache = new Map()
const uploadedByPath = new Map()
const mapEntries = []
const skippedEntries = []

const loadUser = async (userId) => {
  const id = toId(userId)
  if (!OBJECT_ID_RE.test(id)) return null
  if (userCache.has(id)) return userCache.get(id)
  const doc = await User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { projection: { role: 1 } }
  )
  userCache.set(id, doc)
  return doc
}

const resolveActor = async ({ doc, source, mongoPath, legacyRef }) => {
  const fromName = parseFilenameActor(legacyRef)
  const docActorId = pickDocActorId(doc, source)
  const actorId = fromName.userId || docActorId
  let actorRole = source.defaultRole || ""

  if (source.actorRoleFromDoc && doc.role) {
    actorRole = doc.role
  } else if (actorId) {
    const user = await loadUser(actorId)
    if (user?.role) actorRole = user.role
  }

  const side = fromName.side || sideFromPath(mongoPath)
  let entityHint = ""
  if (side && actorId) entityHint = `${actorId}:${side}`
  else if (mongoPath.includes("profileImage") || mongoPath.includes("signature.imageRef")) {
    entityHint = actorId
  } else if (actorId) {
    entityHint = actorId
  }

  return { actorId, actorRole: actorRole || "User", entityHint }
}

const uploadLegacyFile = async ({ legacyRef, policy, actorId, actorRole, entityHint }) => {
  if (uploadedByPath.has(legacyRef)) {
    stats.reused += 1
    return uploadedByPath.get(legacyRef)
  }

  const absolutePath = resolveLegacyUploadPath(legacyRef, UPLOADS_ROOT)
  if (!absolutePath) {
    remember("invalidPath", legacyRef)
    return null
  }
  if (!fs.existsSync(absolutePath)) {
    remember("missing", `${legacyRef} -> ${absolutePath}`)
    return null
  }

  if (!APPLY) {
    uploadedByPath.set(legacyRef, `dry-run:${legacyRef}`)
    stats.uploaded += 1
    return uploadedByPath.get(legacyRef)
  }

  const buffer = fs.readFileSync(absolutePath)
  const originalName = path.basename(absolutePath)
  try {
    const payload = await storageClient.upload({
      file: {
        buffer,
        mimetype: mimeFromName(originalName),
        originalname: originalName,
      },
      policy,
      actorId,
      actorRole,
      entityHint,
      sourceService: "legacy-upload-migration",
    })
    const fileRef = payload.file_ref || payload.fileRef
    if (!fileRef) throw new Error("Storage upload returned no file_ref")
    uploadedByPath.set(legacyRef, fileRef)
    stats.uploaded += 1
    return fileRef
  } catch (error) {
    remember("uploadFailed", `${legacyRef}: ${error.message}`)
    return null
  }
}

const migrateSource = async (source) => {
  const col = source.Model.collection
  const docs = await col.find(legacyFilter(source.matchPaths)).toArray()
  let processed = 0

  for (const doc of docs) {
    if (LIMIT && stats.hits >= LIMIT) break
    const hits = collectLegacyHits(doc)
    if (!hits.length) continue

    stats.docs += 1
    const $set = {}

    for (const hit of hits) {
      if (LIMIT && stats.hits >= LIMIT) break
      stats.hits += 1
      processed += 1

      const policy = policyFromRef(hit.legacyRef)
      if (!policy) {
        remember("unknownPolicy", hit.legacyRef)
        skippedEntries.push({
          source: source.name,
          collection: col.collectionName,
          documentId: String(doc._id),
          mongoPath: hit.mongoPath,
          legacyRef: hit.legacyRef,
          reason: "unknown-policy",
        })
        continue
      }

      const actor = await resolveActor({
        doc,
        source,
        mongoPath: hit.mongoPath,
        legacyRef: hit.legacyRef,
      })
      const fileRef = await uploadLegacyFile({
        legacyRef: hit.legacyRef,
        policy,
        ...actor,
      })
      if (!fileRef) {
        skippedEntries.push({
          source: source.name,
          collection: col.collectionName,
          documentId: String(doc._id),
          mongoPath: hit.mongoPath,
          legacyRef: hit.legacyRef,
          diskPath: resolveLegacyUploadPath(hit.legacyRef, UPLOADS_ROOT),
          policy,
          reason: fs.existsSync(resolveLegacyUploadPath(hit.legacyRef, UPLOADS_ROOT) || "")
            ? "upload-failed"
            : "missing-file",
        })
        continue
      }

      const absolutePath = resolveLegacyUploadPath(hit.legacyRef, UPLOADS_ROOT)
      mapEntries.push({
        source: source.name,
        collection: col.collectionName,
        documentId: String(doc._id),
        mongoPath: hit.mongoPath,
        legacyRef: hit.legacyRef,
        diskPath: absolutePath,
        mediaRef: String(fileRef).startsWith("dry-run:") ? null : fileRef,
        policy,
        planned: !APPLY,
      })

      if (!APPLY || String(fileRef).startsWith("dry-run:")) continue
      $set[hit.mongoPath] = fileRef
    }

    if (APPLY && Object.keys($set).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set })
      stats.rewritten += Object.keys($set).length
    }
  }

  return { scanned: docs.length, processed }
}

const printSamples = (label, items) => {
  if (!items.length) return
  console.log(`  ${label}:`)
  for (const item of items) console.log(`    - ${item}`)
}

const writeMapFile = (payload) => {
  fs.mkdirSync(path.dirname(MAP_PATH), { recursive: true })
  fs.writeFileSync(MAP_PATH, `${JSON.stringify(payload, null, 2)}\n`)
}

const readCurrentValue = (doc, mongoPath) => {
  const parts = String(mongoPath || "").split(".").filter(Boolean)
  let current = doc
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

const revertFromMap = async (mapPath) => {
  if (!fs.existsSync(mapPath)) {
    throw new Error(`Revert map not found: ${mapPath}`)
  }

  const payload = JSON.parse(fs.readFileSync(mapPath, "utf8"))
  const entries = Array.isArray(payload.entries) ? payload.entries : []
  if (!entries.length) {
    console.log("Revert map has no entries.")
    return
  }

  const bySource = new Map()
  for (const entry of entries) {
    const key = entry.source
    if (!bySource.has(key)) bySource.set(key, [])
    bySource.get(key).push(entry)
  }

  let restored = 0
  let skipped = 0
  let missingDocs = 0

  for (const [sourceName, sourceEntries] of bySource) {
    const source = sourceByName.get(sourceName)
    if (!source) {
      console.log(`- skip unknown source ${sourceName} (${sourceEntries.length} entries)`)
      skipped += sourceEntries.length
      continue
    }

    const col = source.Model.collection
    const byDoc = new Map()
    for (const entry of sourceEntries) {
      if (!byDoc.has(entry.documentId)) byDoc.set(entry.documentId, [])
      byDoc.get(entry.documentId).push(entry)
    }

    let sourceRestored = 0
    for (const [documentId, docEntries] of byDoc) {
      if (!OBJECT_ID_RE.test(documentId)) {
        skipped += docEntries.length
        continue
      }

      const doc = await col.findOne({ _id: new mongoose.Types.ObjectId(documentId) })
      if (!doc) {
        missingDocs += 1
        skipped += docEntries.length
        continue
      }

      const $set = {}
      for (const entry of docEntries) {
        if (!entry.legacyRef || !entry.mongoPath) {
          skipped += 1
          continue
        }
        const current = readCurrentValue(doc, entry.mongoPath)
        if (entry.mediaRef && current && current !== entry.mediaRef) {
          skipped += 1
          continue
        }
        $set[entry.mongoPath] = entry.legacyRef
      }

      if (Object.keys($set).length === 0) continue
      await col.updateOne({ _id: doc._id }, { $set })
      restored += Object.keys($set).length
      sourceRestored += Object.keys($set).length
    }

    console.log(`- ${sourceName}: restored ${sourceRestored} field(s)`)
  }

  console.log("")
  console.log("Revert summary")
  console.log(`- Fields restored to /uploads/ paths: ${restored}`)
  console.log(`- Skipped (changed since migrate, missing doc, or unknown source): ${skipped}`)
  console.log(`- Missing documents: ${missingDocs}`)
}

const run = async () => {
  await connectDatabase()

  if (REVERT_MAP_PATH) {
    console.log("Legacy media:// -> /uploads revert")
    console.log(`Map: ${REVERT_MAP_PATH}`)
    console.log("")
    await revertFromMap(REVERT_MAP_PATH)
    return
  }

  console.log("Legacy /uploads -> media:// migration")
  console.log(`Mode: ${APPLY ? "APPLY (upload + rewrite)" : "DRY RUN (no writes)"}`)
  console.log(`Uploads root: ${UPLOADS_ROOT}`)
  console.log(`Map file: ${MAP_PATH}`)
  if (LIMIT) console.log(`Hit limit: ${LIMIT}`)
  if (ONLY_COLLECTION) console.log(`Collection filter: ${ONLY_COLLECTION}`)
  console.log("")

  if (APPLY) {
    if (!env.storage.serviceUrl || !env.storage.internalApiKey) {
      throw new Error("STORAGE_SERVICE_URL and STORAGE_INTERNAL_API_KEY are required for --apply")
    }
  }

  const sources = SOURCES.filter((source) => !ONLY_COLLECTION || source.name === ONLY_COLLECTION)
  if (!sources.length) {
    throw new Error(`Unknown --collection=${ONLY_COLLECTION}`)
  }

  for (const source of sources) {
    if (LIMIT && stats.hits >= LIMIT) break
    const result = await migrateSource(source)
    console.log(
      `- ${source.name}: ${result.scanned} matching docs, ${result.processed} legacy refs`
    )
  }

  console.log("")
  console.log("Summary")
  console.log(`- Documents with legacy refs: ${stats.docs}`)
  console.log(`- Legacy refs found: ${stats.hits}`)
  console.log(`- Uploaded (or would upload): ${stats.uploaded}`)
  console.log(`- Reused already-uploaded path: ${stats.reused}`)
  console.log(`- Fields rewritten: ${stats.rewritten}`)
  console.log(`- Missing files: ${stats.missing}`)
  console.log(`- Invalid paths: ${stats.invalidPath}`)
  console.log(`- Unknown upload folder/policy: ${stats.unknownPolicy}`)
  console.log(`- Upload failures: ${stats.uploadFailed}`)
  printSamples("Missing", samples.missing)
  printSamples("Invalid path", samples.invalidPath)
  printSamples("Unknown policy", samples.unknownPolicy)
  printSamples("Upload failed", samples.uploadFailed)

  writeMapFile({
    createdAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    uploadsRoot: UPLOADS_ROOT,
    entries: mapEntries,
    skipped: skippedEntries,
  })
  console.log(`- Map written: ${MAP_PATH} (${mapEntries.length} migrated, ${skippedEntries.length} skipped)`)

  if (!APPLY) {
    console.log("")
    console.log("Dry run only. Re-run with --apply to upload into storage-backend and rewrite Mongo.")
    console.log("Original files under backend/uploads are left in place.")
    console.log(`Revert later with: node scripts/migrate_legacy_uploads_to_storage.mjs --revert=${MAP_PATH}`)
  } else {
    console.log("")
    console.log(`Revert with: node scripts/migrate_legacy_uploads_to_storage.mjs --revert=${MAP_PATH}`)
  }
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {})
  })
