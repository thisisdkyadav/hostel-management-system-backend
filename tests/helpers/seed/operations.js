/**
 * Domain fixtures + realtime helpers for the operations-area integration tests.
 *
 * Everything creates real documents via the backend's own models (dynamic
 * imports, same pattern as helpers/seed.js). Also provides:
 *   - initRealtime(): boots Socket.IO (not listening) so getIO()/Redis pub
 *     client exist for security + online-users endpoints.
 *   - patchSessionHostel(): the fabricated session hardcodes `hostel: null`;
 *     several operations endpoints read req.user.hostel._id, so tests patch
 *     the stored session document in Redis for a given cookie.
 *   - encryptQrExpiry(): builds valid QR payloads (AES-CBC via node-forge,
 *     mirroring src/utils/qrUtils.js decryptData).
 */
import crypto from "node:crypto"
import http from "node:http"
import forge from "node-forge"

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

// ---------------------------------------------------------------------------
// Realtime (Socket.IO + its Redis pub client)
// ---------------------------------------------------------------------------

let realtimeReady = null

/** Initialize Socket.IO against a never-listening HTTP server (idempotent). */
export function initRealtime() {
  if (!realtimeReady) {
    realtimeReady = (async () => {
      const { initializeSocketIO } = await import("../../../src/loaders/socket.loader.js")
      initializeSocketIO(new http.Server())
    })()
  }
  return realtimeReady
}

// ---------------------------------------------------------------------------
// Session patching (req.user.hostel)
// ---------------------------------------------------------------------------

/**
 * Patch userData.hostel inside the Redis session backing `cookie`
 * (the value returned by as(user): "connect.sid=s:<sid>.<sig>").
 */
export async function patchSessionHostel(cookie, hostel) {
  const { default: Redis } = await import("ioredis")
  const { env } = await import("../../../src/config/env.config.js")
  const sid = decodeURIComponent(cookie).split("s:")[1].split(".")[0]
  const redis = new Redis(env.REDIS_URL)
  try {
    const key = `${env.REDIS_SESSION_PREFIX}${sid}`
    const raw = await redis.get(key)
    if (!raw) throw new Error(`session ${sid} not found in redis`)
    const session = JSON.parse(raw)
    session.userData = {
      ...session.userData,
      hostel: hostel
        ? { _id: String(hostel._id ?? hostel.id), name: hostel.name, type: hostel.type }
        : null,
    }
    await redis.set(key, JSON.stringify(session), "KEEPTTL")
  } finally {
    redis.disconnect()
  }
}

// ---------------------------------------------------------------------------
// QR payloads (mirror qrUtils.decryptData: AES-CBC, hex key, base64 iv:data)
// ---------------------------------------------------------------------------

export function encryptQrExpiry(aesKeyHex, expiryMs) {
  const key = forge.util.hexToBytes(aesKeyHex)
  const iv = forge.random.getBytesSync(16)
  const cipher = forge.cipher.createCipher("AES-CBC", key)
  cipher.start({ iv })
  cipher.update(forge.util.createBuffer(String(expiryMs), "utf8"))
  cipher.finish()
  return `${forge.util.encode64(iv)}:${forge.util.encode64(cipher.output.getBytes())}`
}

export function newAesKey() {
  return crypto.randomBytes(32).toString("hex")
}

// ---------------------------------------------------------------------------
// Domain fixtures
// ---------------------------------------------------------------------------

const models = async () => import("../../../src/models/index.js")

export async function createHostel({ name, type = "room-only", gender = "Boys", isArchived = false } = {}) {
  const { Hostel } = await models()
  return Hostel.create({
    name: name ?? `Test Hostel ${unique()}`,
    type,
    gender,
    isArchived,
  })
}

export async function createUnit({ hostelId, unitNumber, floor = 0 } = {}) {
  const { Unit } = await models()
  return Unit.create({
    hostelId,
    unitNumber: unitNumber ?? `U${unique()}`,
    floor,
  })
}

export async function createRoom({
  hostelId,
  unitId = undefined,
  roomNumber,
  capacity = 2,
  status = "Active",
  occupancy = 0,
  ...extra
} = {}) {
  const { Room } = await models()
  return Room.create({
    hostelId,
    unitId,
    roomNumber: roomNumber ?? `R${counter++}`,
    capacity,
    status,
    occupancy,
    ...extra,
  })
}

export async function createStudentProfile({ userId, rollNumber, degree = "B.Tech", department = "CSE", gender = "Male" } = {}) {
  const { StudentProfile } = await models()
  return StudentProfile.create({
    userId,
    rollNumber: rollNumber ?? `RN${unique()}`.toUpperCase(),
    degree,
    department,
    gender,
    status: "Active",
  })
}

export async function createAllocation({ userId, studentProfileId, hostelId, roomId, unitId = undefined, bedNumber = 1 } = {}) {
  const { RoomAllocation } = await models()
  return RoomAllocation.create({
    userId,
    studentProfileId,
    hostelId,
    roomId,
    unitId,
    bedNumber,
  })
}

export async function createSecurityProfile({ userId, hostelId } = {}) {
  const { Security } = await models()
  return Security.create({ userId, hostelId })
}

export async function createWardenProfile({ userId, hostelIds = [], activeHostelId = null, status } = {}) {
  const { Warden } = await models()
  return Warden.create({
    userId,
    hostelIds,
    activeHostelId,
    status: status ?? (activeHostelId || hostelIds.length > 0 ? "assigned" : "unassigned"),
  })
}

export async function createMaintenanceProfile({ userId, category = "Plumbing" } = {}) {
  const { MaintenanceStaff } = await models()
  return MaintenanceStaff.create({ userId, category })
}

export async function createCheckInOutEntry({
  userId,
  hostelId,
  hostelName,
  room = "101",
  unit = undefined,
  bed = "1",
  status = "Checked In",
  isSameHostel = true,
  reason = undefined,
  dateAndTime = new Date(),
} = {}) {
  const { CheckInOut } = await models()
  return CheckInOut.create({
    userId,
    hostelId,
    hostelName,
    room,
    unit,
    bed,
    status,
    isSameHostel,
    reason,
    dateAndTime,
  })
}

export async function createLeave({ userId, reason = "Family function", startDate, endDate, status = "Pending" } = {}) {
  const { Leave } = await models()
  return Leave.create({
    userId,
    reason,
    startDate: startDate ?? new Date(),
    endDate: endDate ?? new Date(Date.now() + 86400000),
    status,
  })
}

export async function createTask({ title, description = "Test task", createdBy, assignedUsers = [], priority = "Medium", dueDate, category = "Other", status = "Created" } = {}) {
  const { Task } = await models()
  return Task.create({
    title: title ?? `Task ${unique()}`,
    description,
    createdBy,
    assignedUsers,
    priority,
    dueDate: dueDate ?? new Date(Date.now() + 7 * 86400000),
    category,
    status,
  })
}

export async function createStaffAttendance({ userId, hostelId, type = "checkIn", createdAt } = {}) {
  const { StaffAttendance } = await models()
  return StaffAttendance.create({ userId, hostelId, type, createdAt })
}

export async function createVisitor({ hostelId, name, phone = "9999999999", room = "101", status = "Checked In" } = {}) {
  const { Visitors } = await models()
  return Visitors.create({ hostelId, name: name ?? `Visitor ${unique()}`, phone, room, status })
}

export async function createComplaint({ userId, title, status = "Pending" } = {}) {
  const { Complaint } = await models()
  return Complaint.create({
    userId,
    title: title ?? `Complaint ${unique()}`,
    description: "Integration-test complaint",
    status,
  })
}

export async function createEvent({ hostelId, eventName, dateAndTime } = {}) {
  const { Event } = await models()
  return Event.create({
    eventName: eventName ?? `Event ${unique()}`,
    description: "Integration-test event",
    dateAndTime: dateAndTime ?? new Date(Date.now() + 86400000),
    hostelId,
  })
}

export async function createLostFoundItem({ itemName, status = "Active" } = {}) {
  const { default: LostAndFound } = await import("../../../src/models/lost-found/LostAndFound.model.js")
  return LostAndFound.create({
    itemName: itemName ?? `Item ${unique()}`,
    description: "Integration-test lost & found item",
    status,
  })
}

// ---------------------------------------------------------------------------
// Online-users Redis fabrication (mirrors utils/redisOnlineUsers.js keys)
// ---------------------------------------------------------------------------

const ONLINE_USERDATA_PREFIX = "online:userdata:"
const ONLINE_USER_SOCKETS_PREFIX = "online:user:"
const ONLINE_SOCKET_PREFIX = "online:socket:"
const ONLINE_BY_ROLE_KEY = "online:by_role"
const ONLINE_BY_HOSTEL_KEY = "online:by_hostel"

/**
 * Fabricate an "online" presence entry straight into Redis.
 * Returns the socketId used.
 */
export async function fabricateOnlineUser({ userId, role, hostelId = null, userName, userEmail, socketId } = {}) {
  const { default: Redis } = await import("ioredis")
  const { env } = await import("../../../src/config/env.config.js")
  const sid = socketId ?? `sock_${crypto.randomBytes(6).toString("hex")}`
  const now = new Date().toISOString()
  const redis = new Redis(env.REDIS_URL)
  try {
    const pipeline = redis.pipeline()
    pipeline.set(
      `${ONLINE_USERDATA_PREFIX}${userId}`,
      JSON.stringify({ userId: String(userId), userName, userEmail, role, hostelId: hostelId ? String(hostelId) : null, connectedAt: now, lastActivity: now }),
      "EX",
      300
    )
    pipeline.sadd(`${ONLINE_USER_SOCKETS_PREFIX}${userId}`, sid)
    pipeline.expire(`${ONLINE_USER_SOCKETS_PREFIX}${userId}`, 300)
    pipeline.set(`${ONLINE_SOCKET_PREFIX}${sid}`, JSON.stringify({ userId: String(userId), role, hostelId }), "EX", 300)
    pipeline.hincrby(ONLINE_BY_ROLE_KEY, role, 1)
    if (hostelId) pipeline.hincrby(ONLINE_BY_HOSTEL_KEY, String(hostelId), 1)
    await pipeline.exec()
  } finally {
    redis.disconnect()
  }
  return sid
}

/** Remove every online:* key (tests own this namespace during their run). */
export async function clearOnlineUsersKeys() {
  const { default: Redis } = await import("ioredis")
  const { env } = await import("../../../src/config/env.config.js")
  const redis = new Redis(env.REDIS_URL)
  try {
    const keys = [
      ...(await redis.keys(`${ONLINE_USERDATA_PREFIX}*`)),
      ...(await redis.keys(`${ONLINE_USER_SOCKETS_PREFIX}*`)),
      ...(await redis.keys(`${ONLINE_SOCKET_PREFIX}*`)),
      ONLINE_USERS_KEY(),
      ONLINE_BY_ROLE_KEY,
      ONLINE_BY_HOSTEL_KEY,
    ].filter(Boolean)
    if (keys.length > 0) await redis.del(...keys)
  } finally {
    redis.disconnect()
  }
}

function ONLINE_USERS_KEY() {
  return "online:users"
}
