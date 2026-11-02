/**
 * Bio-photo file rules. The face scanner software (EasyWDMS "Import Bio-Photo")
 * takes JPEG or PNG; we accept only those, recognised by content (never by
 * file name or declared type), and read the pixel size from the header.
 */

export const BIO_PHOTO_RULES = Object.freeze({
  formats: ["JPG", "PNG"],
  contentTypes: ["image/jpeg", "image/png"],
  maxSizeBytes: 5 * 1024 * 1024,
  maxSizeMb: 5,
  minSidePx: 300,
  maxSidePx: 6000,
})

const isJpeg = (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const isPng = (buffer) => buffer.length > 24 && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)

/** "image/jpeg" | "image/png" | "" from the file's first bytes. */
export const detectBioPhotoType = (buffer) => {
  if (!Buffer.isBuffer(buffer)) return ""
  if (isJpeg(buffer)) return "image/jpeg"
  if (isPng(buffer)) return "image/png"
  return ""
}

const pngSize = (buffer) => {
  // IHDR is always the first chunk: width/height at bytes 16..23.
  if (buffer.toString("latin1", 12, 16) !== "IHDR") return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

// Start-of-frame markers carry the size (C0–CF except DHT C4, JPG C8, DAC CC).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

const jpegSize = (buffer) => {
  let offset = 2
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) return null
    const marker = buffer[offset + 1]
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    const length = buffer.readUInt16BE(offset + 2)
    if (length < 2) return null
    if (SOF_MARKERS.has(marker)) {
      if (offset + 9 > buffer.length) return null
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

/** { width, height } from a JPEG/PNG header, or null when unreadable. */
export const readBioPhotoSize = (buffer, contentType = detectBioPhotoType(buffer)) => {
  try {
    if (contentType === "image/png") return pngSize(buffer)
    if (contentType === "image/jpeg") return jpegSize(buffer)
  } catch {
    return null
  }
  return null
}

/**
 * Check an uploaded buffer against the rules.
 * Returns { ok: true, contentType, width, height } or { ok: false, message }.
 */
export const validateBioPhotoBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { ok: false, message: "No photo uploaded" }
  const contentType = detectBioPhotoType(buffer)
  if (!contentType) return { ok: false, message: "Only JPG or PNG photos are accepted" }
  if (buffer.length > BIO_PHOTO_RULES.maxSizeBytes) {
    return { ok: false, message: `The photo must be ${BIO_PHOTO_RULES.maxSizeMb} MB or smaller` }
  }
  const size = readBioPhotoSize(buffer, contentType)
  if (!size || !size.width || !size.height) return { ok: false, message: "This photo couldn't be read. Please try another JPG or PNG." }
  const shortSide = Math.min(size.width, size.height)
  const longSide = Math.max(size.width, size.height)
  if (shortSide < BIO_PHOTO_RULES.minSidePx) {
    return { ok: false, message: `The photo is too small (${size.width}×${size.height}). Use one at least ${BIO_PHOTO_RULES.minSidePx} pixels on each side.` }
  }
  if (longSide > BIO_PHOTO_RULES.maxSidePx) {
    return { ok: false, message: `The photo is too large (${size.width}×${size.height}). Use one at most ${BIO_PHOTO_RULES.maxSidePx} pixels on each side.` }
  }
  return { ok: true, contentType, width: size.width, height: size.height }
}
