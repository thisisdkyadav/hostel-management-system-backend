/**
 * Domain fixtures for the student-affairs test suites.
 *
 * Everything is created through the backend's own models/services so tests
 * exercise the same validation and defaults as prod.
 */
import crypto from "node:crypto"

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export const saSeed = {
  /**
   * Student User + StudentProfile pair. Roll numbers are uppercased by the
   * model, exactly like prod.
   */
  async studentWithProfile({
    rollNumber,
    name,
    email,
    department = "Computer Science",
    degree = "B.Tech",
    batch = "2023",
    groups = [],
    status = "Active",
    idCard = null,
    aesKey = null,
  } = {}) {
    const { default: User } = await import("../../../src/models/user/User.model.js")
    const { default: StudentProfile } = await import("../../../src/models/student/StudentProfile.model.js")
    const n = unique()
    const user = await User.create({
      name: name ?? `SA Student ${n}`,
      email: email ?? `sa-student-${n}@hms.test`,
      role: "Student",
      ...(aesKey ? { aesKey } : {}),
    })
    const profile = await StudentProfile.create({
      userId: user._id,
      rollNumber: rollNumber ?? `SAn${n}`.toUpperCase(),
      department,
      degree,
      batch,
      groups,
      status,
      ...(idCard ? { idCard } : {}),
    })
    return { user, profile }
  },

  /** Gymkhana role user with a specific subRole (GS Gymkhana, Club, ...). */
  gymkhana(subRole = "GS Gymkhana", extra = {}) {
    return seedCreateUser({ role: "Gymkhana", subRole, ...extra })
  },

  /** Academics role user (optionally with the HOD subRole). */
  academics(subRole = null) {
    return seedCreateUser({ role: "Academics", subRole })
  },

  /** Re-fetch a full User document by id (needed to fabricate sessions). */
  async userById(id) {
    const { default: User } = await import("../../../src/models/user/User.model.js")
    return User.findById(id)
  },

  /**
   * Build a campus-access QR payload (AES-256-CBC, "iv:payload" base64 form)
   * that attendanceService.resolveStudentByQr can decrypt with the user's
   * aesKey. Mirrors the format produced by the QR generation flow.
   */
  qrPayload(aesKeyHex, expiryMs = Date.now() + 60_000) {
    const key = Buffer.from(String(aesKeyHex), "hex")
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
    const encrypted = Buffer.concat([cipher.update(String(expiryMs), "utf8"), cipher.final()])
    return `${iv.toString("base64")}:${encrypted.toString("base64")}`
  },

  /** Random 32-byte hex key, same shape as utils/qrUtils.generateKey(). */
  aesKey() {
    return crypto.randomBytes(32).toString("hex")
  },

  /**
   * Create an action-link token directly (used because SMTP is disabled in the
   * test environment, so emailed tokens get invalidated by the dispatch flow).
   */
  async actionLinkToken(options) {
    const { createActionLinkToken } = await import(
      "../../../src/services/action-links/action-link-token.service.js"
    )
    return createActionLinkToken(options)
  },
}

async function seedCreateUser(options) {
  const { seed } = await import("../seed.js")
  return seed.createUser(options)
}

export default saSeed
