/**
 * Domain fixtures for the students-area integration tests (dining,
 * profiles-admin, profiles-self, student-profile).
 *
 * Everything creates real documents via the backend's own models (dynamic
 * imports, same pattern as helpers/seed.js). Fresh filename so it never
 * collides with other areas' helpers.
 */

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

const models = async () => import("../../../src/models/index.js")

// ---------------------------------------------------------------------------
// UTC day helpers (mirror services/dining/dining-rebate.service.js normalizeDay)
// ---------------------------------------------------------------------------

export const DAY_MS = 24 * 60 * 60 * 1000

/** UTC-midnight-normalized date, offset by `days` from today. */
export function utcDay(days = 0) {
  const now = new Date()
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return new Date(midnight + days * DAY_MS)
}

export function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Student profiles + hostel fixtures
// ---------------------------------------------------------------------------

export async function createStudentProfile({
  userId,
  rollNumber,
  degree = "B.Tech",
  department = "CSE",
  gender = "Male",
  status = "Active",
  ...extra
} = {}) {
  const { StudentProfile } = await models()
  return StudentProfile.create({
    userId,
    rollNumber: rollNumber ?? `RN${unique()}`.toUpperCase(),
    degree,
    department,
    gender,
    status,
    ...extra,
  })
}

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
    roomNumber: roomNumber ?? `R${unique()}`,
    capacity,
    status,
    occupancy,
    ...extra,
  })
}

export async function createAllocation({
  userId,
  studentProfileId,
  hostelId,
  roomId,
  unitId = undefined,
  bedNumber = 1,
} = {}) {
  const { RoomAllocation } = await models()
  const allocation = await RoomAllocation.create({
    userId,
    studentProfileId,
    hostelId,
    roomId,
    unitId,
    bedNumber,
  })
  // Keep the profile's current-allocation link in sync (the app maintains this
  // through the room owner; seeding mirrors the end state).
  const { StudentProfile } = await models()
  await StudentProfile.updateOne({ _id: studentProfileId }, { $set: { currentRoomAllocation: allocation._id } })
  return allocation
}

// ---------------------------------------------------------------------------
// Dining fixtures
// ---------------------------------------------------------------------------

export async function createCaterer({ name, email } = {}) {
  const { Caterer } = await models()
  const n = unique()
  return Caterer.create({
    name: name ?? `Caterer ${n}`,
    email: email ?? `caterer-${n}@hms.test`,
  })
}

/**
 * Dining period. Dates default to a period that is currently running AND has an
 * open self-registration window.
 */
export async function createDiningPeriod({
  startDate = utcDay(-1),
  endDate = utcDay(10),
  registrationEnabled = true,
  allocationStartAt = new Date(Date.now() - 60 * 60 * 1000),
  allocationEndAt = new Date(Date.now() + 2 * 60 * 60 * 1000),
  catererIds = [],
  catererCapacities = [],
  dailyRate = 100,
  eligibilityMode = "all-active",
  eligibleRollNumbers = [],
  isArchived = false,
  rebateSettings,
  ...extra
} = {}) {
  const { DiningPeriod } = await models()
  return DiningPeriod.create({
    startDate,
    endDate,
    registrationEnabled,
    allocationStartAt,
    allocationEndAt,
    catererIds,
    catererCapacities,
    dailyRate,
    eligibilityMode,
    eligibleRollNumbers,
    isArchived,
    ...(rebateSettings ? { rebateSettings } : {}),
    ...extra,
  })
}

export async function createDiningAllocation({
  periodId,
  studentUserId,
  studentProfileId,
  rollNumber,
  catererId,
} = {}) {
  const { DiningAllocation } = await models()
  return DiningAllocation.create({
    periodId,
    studentUserId,
    studentProfileId,
    rollNumber,
    catererId,
    selectedAt: new Date(),
  })
}

export async function createBillingPeriod({ name, diningPeriodIds = [], isArchived = false } = {}) {
  const { DiningBillingPeriod } = await models()
  return DiningBillingPeriod.create({
    name: name ?? `Billing ${unique()}`,
    diningPeriodIds,
    isArchived,
  })
}

export async function createBillingAccount({
  billingPeriodId,
  studentUserId,
  studentProfileId = undefined,
  rollNumber = "",
  allocatedAmount = 0,
} = {}) {
  const { DiningBillingAccount } = await models()
  return DiningBillingAccount.create({
    billingPeriodId,
    studentUserId,
    studentProfileId,
    rollNumber,
    allocatedAmount,
  })
}

// ---------------------------------------------------------------------------
// Profile-adjacent fixtures
// ---------------------------------------------------------------------------

export async function createFamilyMember({ userId, name, relationship = "Father", phone = "9999999999", email, address } = {}) {
  const { FamilyMember } = await models()
  return FamilyMember.create({
    userId,
    name: name ?? `Member ${unique()}`,
    relationship,
    phone,
    ...(email ? { email } : {}),
    ...(address ? { address } : {}),
  })
}

export async function createHealthRecord({ userId, bloodGroup, insuranceNumber, insuranceProvider } = {}) {
  const { Health } = await models()
  return Health.create({
    userId,
    ...(bloodGroup ? { bloodGroup } : {}),
    insurance: {
      ...(insuranceProvider ? { insuranceProvider } : {}),
      ...(insuranceNumber ? { insuranceNumber } : {}),
    },
  })
}

export async function setConfig(key, value, description = "") {
  const { Configuration } = await models()
  return Configuration.findOneAndUpdate(
    { key },
    { key, value, description },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
}

export default {
  DAY_MS,
  utcDay,
  dayKey,
  createStudentProfile,
  createHostel,
  createUnit,
  createRoom,
  createAllocation,
  createCaterer,
  createDiningPeriod,
  createDiningAllocation,
  createBillingPeriod,
  createBillingAccount,
  createFamilyMember,
  createHealthRecord,
  setConfig,
}
