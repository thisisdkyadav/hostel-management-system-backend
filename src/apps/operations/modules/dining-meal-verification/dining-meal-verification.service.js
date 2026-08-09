import mongoose from "mongoose"
import { studentProfileQueries } from "../../../../services/student/studentProfileQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { diningOwner } from "../../../../services/dining/diningOwner.service.js"
import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { badRequest, notFound, success } from "../../../../services/base/index.js"
import { getIO } from "../../../../loaders/socket.loader.js"
import {
  getApprovedRebateStudentIdsForDay,
  getCatererDiningRebateSummary,
} from "../../../../services/dining-rebate.service.js"

const VERIFIED_STATUS = "verified"
const DUPLICATE_STATUS = "duplicate"
const WRONG_CATERER_STATUS = "wrong-caterer"
const NOT_ALLOCATED_STATUS = "not-allocated"
const UNKNOWN_STUDENT_STATUS = "unknown-student"
const OUTSIDE_MEAL_TIME_STATUS = "outside-meal-time"
const NO_ACTIVE_PERIOD_STATUS = "no-active-period"
const ON_REBATE_STATUS = "on-rebate"

const STATUS_MESSAGES = {
  [VERIFIED_STATUS]: "Meal verified successfully",
  [DUPLICATE_STATUS]: "Student has already been verified for this meal",
  [WRONG_CATERER_STATUS]: "Student is allocated to another caterer",
  [NOT_ALLOCATED_STATUS]: "Student has not selected a caterer for this dining period",
  [UNKNOWN_STUDENT_STATUS]: "Student roll number not found",
  [OUTSIDE_MEAL_TIME_STATUS]: "Scan is outside configured meal timings",
  [NO_ACTIVE_PERIOD_STATUS]: "No active dining period found for this scan time",
  [ON_REBATE_STATUS]: "Student is on approved rebate for this day",
}

const normalizeRollNumber = (value = "") => String(value || "").trim().toUpperCase()

const slugifySlotName = (name = "") => String(name || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")

const parseTimeToMinutes = (value = "") => {
  const [hours, minutes] = String(value || "").split(":").map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const getMinutesForDate = (date = new Date()) => date.getHours() * 60 + date.getMinutes()

const getDayBounds = (date = new Date()) => {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

const isTimeInsideSlot = (date, slot) => {
  const start = parseTimeToMinutes(slot.startTime)
  const end = parseTimeToMinutes(slot.endTime)
  if (start === null || end === null) return false

  const current = getMinutesForDate(date)
  if (start <= end) return current >= start && current <= end

  // Overnight slot, e.g. 22:00 to 02:00.
  return current >= start || current <= end
}

const getMealSlotForDate = (period, date) => {
  const slots = Array.isArray(period?.mealSlots) ? period.mealSlots : []
  const slot = slots.find((candidate) => isTimeInsideSlot(date, candidate))
  if (!slot) return null

  return {
    key: slugifySlotName(slot.name),
    name: slot.name,
    startTime: slot.startTime,
    endTime: slot.endTime,
  }
}

const getActiveDiningPeriodForDate = (date = new Date(), { lean = false } = {}) =>
  diningQueries.findOnePeriod(
    {
      isArchived: false,
      startDate: { $lte: date },
      endDate: { $gte: date },
    },
    { lean }
  )

const serializeCaterer = (caterer = null) => {
  if (!caterer) return null
  return {
    id: caterer._id || caterer.id,
    name: caterer.name,
    email: caterer.email,
  }
}

const serializeStudent = (profile = null) => {
  if (!profile) return null
  const user = profile.userId && typeof profile.userId === "object" ? profile.userId : null

  return {
    id: profile.userId?._id || profile.userId || null,
    profileId: profile._id || profile.id,
    name: user?.name || "",
    email: user?.email || "",
    profileImage: user?.profileImage || "",
    rollNumber: profile.rollNumber,
  }
}

const serializeAvailableStudent = ({ allocation, verificationStateByStudentId = new Map() }) => {
  const profile = allocation?.studentProfileId && typeof allocation.studentProfileId === "object"
    ? allocation.studentProfileId
    : null
  const student = serializeStudent(profile)
  const studentId = String(allocation?.studentUserId?._id || allocation?.studentUserId || student?.id || "")
  const verificationState = verificationStateByStudentId.get(studentId) || {}
  const latestVerification = verificationState.latest || null

  return {
    allocationId: allocation?._id || allocation?.id,
    student,
    rollNumber: allocation?.rollNumber || student?.rollNumber || "",
    selectedAt: allocation?.selectedAt,
    isVerified: Boolean(verificationState.hasVerified),
    latestVerification: latestVerification ? serializeVerification(latestVerification) : null,
  }
}

const serializeVerification = (verification = {}) => ({
  id: verification._id || verification.id,
  periodId: verification.periodId?._id || verification.periodId || null,
  catererId: verification.catererId?._id || verification.catererId || null,
  caterer: serializeCaterer(verification.catererId && typeof verification.catererId === "object" ? verification.catererId : null),
  expectedCatererId: verification.expectedCatererId?._id || verification.expectedCatererId || null,
  expectedCaterer: serializeCaterer(verification.expectedCatererId && typeof verification.expectedCatererId === "object" ? verification.expectedCatererId : null),
  student: serializeStudent(verification.studentProfileId && typeof verification.studentProfileId === "object" ? verification.studentProfileId : null),
  rollNumber: verification.rollNumber,
  mealSlotKey: verification.mealSlotKey,
  mealSlotName: verification.mealSlotName,
  scannedAt: verification.scannedAt,
  source: verification.source,
  status: verification.status,
  scannerId: verification.scannerId?._id || verification.scannerId || null,
  scanner: verification.scannerId && typeof verification.scannerId === "object"
    ? {
      id: verification.scannerId._id || verification.scannerId.id,
      name: verification.scannerId.name,
      type: verification.scannerId.type,
    }
    : null,
  deviceId: verification.deviceId,
  message: verification.message,
  createdAt: verification.createdAt,
})

export const emitDiningMealVerificationEvent = async (verification) => {
  try {
    const io = getIO()
    const populated = await diningQueries.findVerificationByIdPopulated(verification._id, { lean: true })
    const payload = {
      verification: serializeVerification(populated),
      timestamp: new Date(),
    }

    io.to("role:Admin").to("role:Super Admin").emit("dining-meal-verification:new", payload)
    if (populated?.catererId?._id || populated?.catererId) {
      io.to(`caterer:${populated.catererId._id || populated.catererId}`).emit("dining-meal-verification:new", payload)
    }
  } catch (error) {
    console.error("Error emitting dining meal verification event:", error)
  }
}

const createVerificationRecord = async ({
  period = null,
  catererId = null,
  expectedCatererId = null,
  studentProfile = null,
  rollNumber,
  mealSlot = null,
  scannedAt,
  source,
  status,
  scanner = null,
  deviceId = "",
  message = "",
}) => {
  const verification = await diningOwner.createVerification({
    periodId: period?._id || null,
    catererId: catererId || null,
    expectedCatererId: expectedCatererId || null,
    studentUserId: studentProfile?.userId?._id || studentProfile?.userId || null,
    studentProfileId: studentProfile?._id || null,
    rollNumber: normalizeRollNumber(rollNumber),
    mealSlotKey: mealSlot?.key || "",
    mealSlotName: mealSlot?.name || "",
    scannedAt,
    source,
    status,
    scannerId: scanner?._id || null,
    deviceId,
    message: message || STATUS_MESSAGES[status] || status,
  })

  await emitDiningMealVerificationEvent(verification)
  return verification
}

export const verifyDiningMeal = async ({
  rollNumber,
  catererId,
  scannedAt = new Date(),
  source = "manual",
  scanner = null,
  deviceId = "",
}) => {
  const normalizedRollNumber = normalizeRollNumber(rollNumber)
  if (!normalizedRollNumber) {
    return badRequest("Roll number is required")
  }
  if (!mongoose.Types.ObjectId.isValid(catererId)) {
    return badRequest("Valid caterer is required")
  }

  const [caterer, studentProfile, period] = await Promise.all([
    diningQueries.findCatererById(catererId, { lean: true }),
    studentProfileQueries.findByRollNumberCaseInsensitiveWithUserFull(normalizedRollNumber),
    getActiveDiningPeriodForDate(scannedAt, { lean: true }),
  ])

  if (!caterer) {
    return notFound("Caterer")
  }

  if (!studentProfile) {
    const record = await createVerificationRecord({
      catererId,
      rollNumber: normalizedRollNumber,
      scannedAt,
      source,
      scanner,
      deviceId,
      status: UNKNOWN_STUDENT_STATUS,
    })
    return success({ verification: serializeVerification(await diningQueries.findVerificationByIdPopulated(record._id, { lean: true })) }, 201, STATUS_MESSAGES[UNKNOWN_STUDENT_STATUS])
  }

  if (!period) {
    const record = await createVerificationRecord({
      catererId,
      studentProfile,
      rollNumber: normalizedRollNumber,
      scannedAt,
      source,
      scanner,
      deviceId,
      status: NO_ACTIVE_PERIOD_STATUS,
    })
    return success({ verification: serializeVerification(await diningQueries.findVerificationByIdPopulated(record._id, { lean: true })) }, 201, STATUS_MESSAGES[NO_ACTIVE_PERIOD_STATUS])
  }

  const mealSlot = getMealSlotForDate(period, scannedAt)
  if (!mealSlot) {
    const record = await createVerificationRecord({
      period,
      catererId,
      studentProfile,
      rollNumber: normalizedRollNumber,
      scannedAt,
      source,
      scanner,
      deviceId,
      status: OUTSIDE_MEAL_TIME_STATUS,
    })
    return success({ verification: serializeVerification(await diningQueries.findVerificationByIdPopulated(record._id, { lean: true })) }, 201, STATUS_MESSAGES[OUTSIDE_MEAL_TIME_STATUS])
  }

  const allocation = await allocationQueries.findAllocation(
    period._id,
    studentProfile.userId?._id || studentProfile.userId
  )

  if (!allocation) {
    const record = await createVerificationRecord({
      period,
      catererId,
      studentProfile,
      rollNumber: normalizedRollNumber,
      mealSlot,
      scannedAt,
      source,
      scanner,
      deviceId,
      status: NOT_ALLOCATED_STATUS,
    })
    return success({ verification: serializeVerification(await diningQueries.findVerificationByIdPopulated(record._id, { lean: true })) }, 201, STATUS_MESSAGES[NOT_ALLOCATED_STATUS])
  }

  const expectedCatererId = allocation.catererId
  if (String(expectedCatererId) !== String(catererId)) {
    const record = await createVerificationRecord({
      period,
      catererId,
      expectedCatererId,
      studentProfile,
      rollNumber: normalizedRollNumber,
      mealSlot,
      scannedAt,
      source,
      scanner,
      deviceId,
      status: WRONG_CATERER_STATUS,
    })
    return success({ verification: serializeVerification(await diningQueries.findVerificationByIdPopulated(record._id, { lean: true })) }, 201, STATUS_MESSAGES[WRONG_CATERER_STATUS])
  }

  const rebatedStudentIds = await getApprovedRebateStudentIdsForDay({
    periodId: period._id,
    catererId,
    date: scannedAt,
  })
  if (rebatedStudentIds.has(String(studentProfile.userId?._id || studentProfile.userId))) {
    const record = await createVerificationRecord({
      period,
      catererId,
      expectedCatererId,
      studentProfile,
      rollNumber: normalizedRollNumber,
      mealSlot,
      scannedAt,
      source,
      scanner,
      deviceId,
      status: ON_REBATE_STATUS,
    })
    return success({ verification: serializeVerification(await diningQueries.findVerificationByIdPopulated(record._id, { lean: true })) }, 201, STATUS_MESSAGES[ON_REBATE_STATUS])
  }

  const previousVerified = await diningQueries.findOneVerification({
    periodId: period._id,
    studentUserId: studentProfile.userId?._id || studentProfile.userId,
    mealSlotKey: mealSlot.key,
    scannedAt: {
      $gte: getDayBounds(scannedAt).start,
      $lt: getDayBounds(scannedAt).end,
    },
    status: VERIFIED_STATUS,
  }, { lean: true })

  const status = previousVerified ? DUPLICATE_STATUS : VERIFIED_STATUS
  const record = await createVerificationRecord({
    period,
    catererId,
    expectedCatererId,
    studentProfile,
    rollNumber: normalizedRollNumber,
    mealSlot,
    scannedAt,
    source,
    scanner,
    deviceId,
    status,
  })

  return success(
    { verification: serializeVerification(await diningQueries.findVerificationByIdPopulated(record._id, { lean: true })) },
    201,
    STATUS_MESSAGES[status],
  )
}

export const getDiningMealVerificationFeed = async ({
  catererId,
  periodId,
  mealSlotKey,
  status,
  date,
  page = 1,
  limit = 20,
} = {}) => {
  const query = {}
  if (catererId && mongoose.Types.ObjectId.isValid(catererId)) query.catererId = catererId
  if (periodId && mongoose.Types.ObjectId.isValid(periodId)) query.periodId = periodId
  if (mealSlotKey) query.mealSlotKey = String(mealSlotKey).trim()
  if (status) query.status = String(status).trim()
  if (date) {
    const dayBounds = getDayBounds(new Date(date))
    query.scannedAt = { $gte: dayBounds.start, $lt: dayBounds.end }
  }

  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20))
  const skip = (safePage - 1) * safeLimit

  const [entries, total] = await Promise.all([
    diningQueries.findVerificationsPopulated(query, {
      sort: { scannedAt: -1, createdAt: -1 },
      skip,
      limit: safeLimit,
      lean: true,
    }),
    diningQueries.countVerifications(query),
  ])

  return success({
    entries: entries.map(serializeVerification),
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    },
  })
}

export const resolveCatererForUser = async (user) => {
  if (!user?._id) {
    return null
  }

  return diningQueries.findOneCaterer({ userId: user._id, isArchived: false }, { select: "name email userId", lean: true })
}

export const getCurrentMealScope = async (date = new Date()) => {
  const period = await getActiveDiningPeriodForDate(date, { lean: true })
  const mealSlot = period ? getMealSlotForDate(period, date) : null

  return { period, mealSlot }
}

export const getDiningMealVerificationContext = async ({ user = null } = {}) => {
  const now = new Date()
  const caterer = await resolveCatererForUser(user)
  if (!caterer) {
    return notFound("Caterer login")
  }

  const currentPeriod = await getActiveDiningPeriodForDate(now)
    .populate({ path: "catererIds", select: "name email" })
    .lean()
  const currentMealSlot = currentPeriod ? getMealSlotForDate(currentPeriod, now) : null
  const isCatererInCurrentPeriod = currentPeriod
    ? (currentPeriod.catererIds || []).some((periodCaterer) => String(periodCaterer?._id || periodCaterer) === String(caterer._id))
    : false

  return success({
    caterer: serializeCaterer(caterer),
    currentPeriod: currentPeriod
      ? {
        id: currentPeriod._id,
        startDate: currentPeriod.startDate,
        endDate: currentPeriod.endDate,
        mealSlots: currentPeriod.mealSlots || [],
        currentMealSlot,
        isCatererInPeriod: isCatererInCurrentPeriod,
        caterers: Array.isArray(currentPeriod.catererIds)
          ? currentPeriod.catererIds.map(serializeCaterer)
          : [],
      }
      : null,
  })
}

export const getCurrentMealAvailableStudents = async ({ user = null } = {}) => {
  const now = new Date()
  const caterer = await resolveCatererForUser(user)
  if (!caterer) {
    return notFound("Caterer login")
  }

  const period = await getActiveDiningPeriodForDate(now, { lean: true })
  if (!period) {
    return success({
      caterer: serializeCaterer(caterer),
      currentPeriod: null,
      currentMealSlot: null,
      students: [],
      total: 0,
      verifiedCount: 0,
      pendingCount: 0,
      message: "No active dining period found",
    })
  }

  const mealSlot = getMealSlotForDate(period, now)
  const allocations = await allocationQueries.findAllocationsByPeriodAndCaterer(period._id, caterer._id, {
    populateStudent: true,
  })

  const studentUserIds = allocations.map((allocation) => allocation.studentUserId).filter(Boolean)
  const verificationQuery = {
    periodId: period._id,
    catererId: caterer._id,
    studentUserId: { $in: studentUserIds },
    scannedAt: {
      $gte: getDayBounds(now).start,
      $lt: getDayBounds(now).end,
    },
  }

  if (mealSlot?.key) {
    verificationQuery.mealSlotKey = mealSlot.key
  }

  const verifications = await diningQueries.findVerificationsPopulated(verificationQuery, {
    sort: { scannedAt: -1, createdAt: -1 },
    lean: true,
  })
  const verificationStateByStudentId = new Map()
  for (const verification of verifications) {
    const studentId = String(verification.studentUserId?._id || verification.studentUserId || "")
    if (!studentId) continue

    const currentState = verificationStateByStudentId.get(studentId) || { latest: null, hasVerified: false }
    if (!currentState.latest) {
      currentState.latest = verification
    }
    currentState.hasVerified = currentState.hasVerified || verification.status === VERIFIED_STATUS
    verificationStateByStudentId.set(studentId, currentState)
  }

  const rebatedStudentIds = await getApprovedRebateStudentIdsForDay({
    periodId: period._id,
    catererId: caterer._id,
    date: now,
  })
  const students = allocations
    .filter((allocation) => !rebatedStudentIds.has(String(allocation.studentUserId?._id || allocation.studentUserId || "")))
    .map((allocation) => serializeAvailableStudent({ allocation, verificationStateByStudentId }))
  const verifiedCount = students.filter((student) => student.isVerified).length

  return success({
    caterer: serializeCaterer(caterer),
    currentPeriod: {
      id: period._id,
      startDate: period.startDate,
      endDate: period.endDate,
      mealSlots: period.mealSlots || [],
    },
    currentMealSlot: mealSlot,
    students,
    total: students.length,
    verifiedCount,
    pendingCount: Math.max(students.length - verifiedCount, 0),
    rebateCount: rebatedStudentIds.size,
  })
}

export const getDiningRebateSummaryForCaterer = async ({ user = null } = {}) => {
  const caterer = await resolveCatererForUser(user)
  if (!caterer) {
    return notFound("Caterer login")
  }

  return getCatererDiningRebateSummary({ catererId: caterer._id })
}

export default {
  verifyDiningMeal,
  getDiningMealVerificationFeed,
  getDiningMealVerificationContext,
  getCurrentMealAvailableStudents,
  getDiningRebateSummaryForCaterer,
  getCurrentMealScope,
}
