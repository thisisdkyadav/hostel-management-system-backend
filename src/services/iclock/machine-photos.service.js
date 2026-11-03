/**
 * Machine photos — the face photo a machine actually holds, fetched back from it.
 *
 * HMS asks a machine for one person's photo (DATA QUERY BIOPHOTO PIN=…); the
 * machine uploads it on cdata?table=BIOPHOTO. The file is kept on disk, one per
 * machine + person, overwritten on every fetch, so the folder never grows past
 * (machines × people) photos. The row on IclockDeviceUser.machinePhoto says
 * when it came and whether it is byte-identical to the HMS face.
 *
 * Folder: ICLOCK_MACHINE_PHOTO_DIR (default ~/hms-iclock-photos). The iclock
 * receiver writes it and the main backend reads it, so both must run on the
 * same host (they do: one VM).
 */
import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { iclockOwner } from "./iclockOwner.service.js"

export const machinePhotoDir = () => process.env.ICLOCK_MACHINE_PHOTO_DIR || path.join(os.homedir(), "hms-iclock-photos")

const safe = (value) => String(value || "").replace(/[^A-Za-z0-9_-]/g, "_")
const fileFor = (sn, pin) => path.join(machinePhotoDir(), safe(sn), `${safe(pin)}.jpg`)

/** Command that asks a machine for one person's face photo. */
export const photoQueryCommand = (pin) => `DATA QUERY BIOPHOTO PIN=${pin}`

/** Queue a photo fetch for one person on one machine. */
export const requestMachinePhoto = (sn, pin, { command = photoQueryCommand(pin), createdBy = null } = {}) =>
  iclockOwner.queueCommand({ sn, command, ref: { kind: "photo-query", key: String(pin) }, createdBy })

/**
 * Save the photos from a BIOPHOTO / USERPIC upload. Returns how many were saved.
 * Lines without a usable image are logged (field names only, never content) so
 * a firmware that answers differently can be understood from the logs.
 */
export const saveMachinePhotos = async (sn, uploads) => {
  let saved = 0
  for (const upload of uploads) {
    if (!upload.pin || !upload.buffer) {
      console.warn(`[iclock] ${sn}: ${upload.kind || "photo"} upload without a usable image`, JSON.stringify(upload.fields).slice(0, 300))
      continue
    }
    const file = fileFor(sn, upload.pin)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, upload.buffer)
    const sha256 = crypto.createHash("sha256").update(upload.buffer).digest("hex")
    await iclockOwner.setMachinePhoto(sn, upload.pin, { kind: upload.kind, sha256, size: upload.buffer.length })
    saved++
  }
  return saved
}

/** The saved machine photo bytes, or null. */
export const readMachinePhoto = async (sn, pin) => {
  try {
    return await fs.readFile(fileFor(sn, pin))
  } catch {
    return null
  }
}
