import {
  OverallBestPerformerOccurrence,
  OverallBestPerformerApplication,
  StudentProfile,
} from "../../../../models/index.js"
import {
  success,
  created,
  badRequest,
  forbidden,
  notFound,
} from "../../../../services/base/index.js"
import {
  OCCURRENCE_STATUS,
  APPLICATION_STATUS,
  BTP_AWARD_POINTS,
  PROJECT_GRADE_POINTS,
  PUBLICATION_POINTS,
  TECHNOLOGY_TRANSFER_POINTS,
  RESPONSIBILITY_POINTS,
  AWARD_POINTS,
  ACTIVITY_LEVEL_POINTS,
  CO_CURRICULAR_POINTS,
  SECTION_MAX_POINTS,
} from "./best-performer.constants.js"

const roundToTwo = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100
const clamp = (value, max) => Math.max(0, Math.min(roundToTwo(value), max))

const normalizeRollNumbers = (rollNumbers = []) => {
  if (!Array.isArray(rollNumbers)) return []
  return [...new Set(
    rollNumbers
      .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
      .filter(Boolean)
  )]
}

const now = () => new Date()

const closeExpiredOccurrences = async () => {
  const currentTime = now()
  await OverallBestPerformerOccurrence.updateMany(
    {
      status: OCCURRENCE_STATUS.ACTIVE,
      applyEndAt: { $lt: currentTime },
    },
    {
      $set: {
        status: OCCURRENCE_STATUS.CLOSED,
        closedAt: currentTime,
      },
    }
  )
}

const serializeOccurrence = (occurrence, extras = {}) => {
  if (!occurrence) return null
  const data = typeof occurrence.toObject === "function" ? occurrence.toObject() : occurrence
  const currentTime = now()
  const isActive = data.status === OCCURRENCE_STATUS.ACTIVE && new Date(data.applyEndAt) >= currentTime
  return {
    id: data._id,
    title: data.title,
    awardYear: data.awardYear,
    description: data.description || "",
    applyEndAt: data.applyEndAt,
    status: isActive ? OCCURRENCE_STATUS.ACTIVE : OCCURRENCE_STATUS.CLOSED,
    eligibleStudentCount: data.eligibleStudentCount || 0,
    activatedAt: data.activatedAt || data.createdAt,
    closedAt: data.closedAt || null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    ...extras,
  }
}

const serializeApplication = (application) => {
  if (!application) return null
  const data = typeof application.toObject === "function" ? application.toObject() : application
  const calculatedTotal = Number(data?.scoreBreakdown?.total || 0)
  const reviewStatus = data?.review?.status || APPLICATION_STATUS.SUBMITTED
  const finalScore = reviewStatus === APPLICATION_STATUS.APPROVED
    ? Number(data?.review?.finalScore || calculatedTotal)
    : reviewStatus === APPLICATION_STATUS.REJECTED
      ? 0
      : calculatedTotal

  return {
    id: data._id,
    occurrenceId: data.occurrenceId,
    awardYear: data.awardYear,
    studentName: data.studentName,
    studentEmail: data.studentEmail,
    rollNumber: data.rollNumber,
    department: data.department,
    degree: data.degree,
    personalAcademic: data.personalAcademic || {},
    coursework: data.coursework || {},
    projectThesis: data.projectThesis || {},
    responsibilityItems: data.responsibilityItems || [],
    awardItems: data.awardItems || [],
    culturalItems: data.culturalItems || [],
    scienceTechnologyItems: data.scienceTechnologyItems || [],
    gamesSportsItems: data.gamesSportsItems || [],
    coCurricularItems: data.coCurricularItems || [],
    scoreBreakdown: data.scoreBreakdown || {},
    review: data.review || {},
    submittedAt: data.submittedAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    calculatedTotal,
    finalScore,
  }
}

const mapItemPoints = (items = [], pointsMap = {}, max = Number.POSITIVE_INFINITY) => {
  const sanitizedItems = Array.isArray(items) ? items : []
  let total = 0
  const nextItems = sanitizedItems.map((item) => {
    const points = Number(pointsMap[item?.scoreType] || 0)
    total += points
    return {
      ...item,
      calculatedPoints: points,
    }
  })

  return {
    items: nextItems,
    total: clamp(total, max),
  }
}

const scoreCoursework = (coursework = {}) => {
  const rawValue = Number(coursework?.scoreValue || 0)
  const points = clamp(rawValue * 1.5, SECTION_MAX_POINTS.coursework)
  return {
    ...coursework,
    calculatedPoints: points,
  }
}

const scoreProjectThesis = (projectThesis = {}) => {
  const track = projectThesis?.track === "pg_thesis" ? "pg_thesis" : "btech_project"
  const publicationResult = mapItemPoints(
    projectThesis?.publicationItems || [],
    PUBLICATION_POINTS,
    track === "pg_thesis" ? 10 : 5
  )
  const techTransferResult = mapItemPoints(
    projectThesis?.technologyTransferItems || [],
    TECHNOLOGY_TRANSFER_POINTS,
    5
  )

  let total = publicationResult.total
  if (track === "btech_project") {
    total += Math.min(Number(BTP_AWARD_POINTS[projectThesis?.btpAwardLevel] || 0), 5)
    total += Math.min(Number(PROJECT_GRADE_POINTS[projectThesis?.projectGrade] || 0), 5)
  } else {
    total += techTransferResult.total
  }

  return {
    ...projectThesis,
    track,
    publicationItems: publicationResult.items,
    technologyTransferItems: techTransferResult.items,
    calculatedPoints: clamp(total, SECTION_MAX_POINTS.projectThesis),
  }
}

const computeBreakdown = (payload = {}) => {
  const coursework = scoreCoursework(payload.coursework)
  const projectThesis = scoreProjectThesis(payload.projectThesis)
  const responsibilities = mapItemPoints(
    payload.responsibilityItems,
    RESPONSIBILITY_POINTS,
    SECTION_MAX_POINTS.responsibilities
  )
  const awards = mapItemPoints(payload.awardItems, AWARD_POINTS, SECTION_MAX_POINTS.awards)
  const cultural = mapItemPoints(
    payload.culturalItems,
    ACTIVITY_LEVEL_POINTS,
    SECTION_MAX_POINTS.cultural
  )
  const scienceTechnology = mapItemPoints(
    payload.scienceTechnologyItems,
    ACTIVITY_LEVEL_POINTS,
    SECTION_MAX_POINTS.scienceTechnology
  )
  const gamesSports = mapItemPoints(
    payload.gamesSportsItems,
    ACTIVITY_LEVEL_POINTS,
    SECTION_MAX_POINTS.gamesSports
  )
  const coCurricular = mapItemPoints(
    payload.coCurricularItems,
    CO_CURRICULAR_POINTS,
    SECTION_MAX_POINTS.coCurricular
  )

  const breakdown = {
    coursework: coursework.calculatedPoints,
    projectThesis: projectThesis.calculatedPoints,
    responsibilities: responsibilities.total,
    awards: awards.total,
    cultural: cultural.total,
    scienceTechnology: scienceTechnology.total,
    gamesSports: gamesSports.total,
    coCurricular: coCurricular.total,
  }

  breakdown.total = roundToTwo(
    breakdown.coursework +
      breakdown.projectThesis +
      breakdown.responsibilities +
      breakdown.awards +
      breakdown.cultural +
      breakdown.scienceTechnology +
      breakdown.gamesSports +
      breakdown.coCurricular
  )

  return {
    personalAcademic: payload.personalAcademic || {},
    coursework,
    projectThesis,
    responsibilityItems: responsibilities.items,
    awardItems: awards.items,
    culturalItems: cultural.items,
    scienceTechnologyItems: scienceTechnology.items,
    gamesSportsItems: gamesSports.items,
    coCurricularItems: coCurricular.items,
    scoreBreakdown: breakdown,
  }
}

const getStudentProfileForUser = async (userId) => {
  return StudentProfile.findOne({ userId })
    .populate({
      path: "userId",
      select: "name email",
    })
}

const getOccurrenceById = async (id) => {
  await closeExpiredOccurrences()
  return OverallBestPerformerOccurrence.findById(id)
}

const getActiveOccurrence = async () => {
  await closeExpiredOccurrences()
  return OverallBestPerformerOccurrence.findOne({ status: OCCURRENCE_STATUS.ACTIVE })
    .sort({ applyEndAt: -1, createdAt: -1 })
}

const getLatestAppliedOccurrenceForStudent = async (userId) => {
  const application = await OverallBestPerformerApplication.findOne({ studentUserId: userId })
    .populate("occurrenceId")
    .sort({ submittedAt: -1, createdAt: -1 })

  if (!application?.occurrenceId) return { occurrence: null, application: null }

  return {
    occurrence: application.occurrenceId,
    application,
  }
}

const assertEligibleStudentRollNumbers = async (rollNumbers = []) => {
  const normalizedRollNumbers = normalizeRollNumbers(rollNumbers)
  if (normalizedRollNumbers.length === 0) {
    return badRequest("At least one eligible roll number is required")
  }

  const profiles = await StudentProfile.find({ rollNumber: { $in: normalizedRollNumbers } })
    .select("_id rollNumber userId")

  const foundRollNumbers = new Set(profiles.map((profile) => String(profile.rollNumber).toUpperCase()))
  const missingRollNumbers = normalizedRollNumbers.filter((rollNumber) => !foundRollNumbers.has(rollNumber))

  if (missingRollNumbers.length > 0) {
    return badRequest(`Unknown roll numbers: ${missingRollNumbers.join(", ")}`)
  }

  return success({
    normalizedRollNumbers,
    eligibleStudentCount: normalizedRollNumbers.length,
  })
}

class BestPerformerService {
  async createOccurrence(payload, user) {
    const eligibleResult = await assertEligibleStudentRollNumbers(payload.eligibleRollNumbers)
    if (!eligibleResult.success) return eligibleResult

    const applyEndAt = new Date(payload.applyEndAt)
    if (Number.isNaN(applyEndAt.getTime()) || applyEndAt <= now()) {
      return badRequest("Application end date must be in the future")
    }

    await closeExpiredOccurrences()
    await OverallBestPerformerOccurrence.updateMany(
      { status: OCCURRENCE_STATUS.ACTIVE },
      {
        $set: {
          status: OCCURRENCE_STATUS.CLOSED,
          closedAt: now(),
          updatedBy: user._id,
        },
      }
    )

    const occurrence = await OverallBestPerformerOccurrence.create({
      title: payload.title,
      awardYear: payload.awardYear,
      description: payload.description || "",
      applyEndAt,
      status: OCCURRENCE_STATUS.ACTIVE,
      eligibleRollNumbers: eligibleResult.data.normalizedRollNumbers,
      eligibleStudentCount: eligibleResult.data.eligibleStudentCount,
      createdBy: user._id,
      updatedBy: user._id,
      activatedAt: now(),
    })

    return created({
      occurrence: serializeOccurrence(occurrence),
    }, "Overall Best Performer occurrence activated")
  }

  async updateOccurrence(id, payload, user) {
    const occurrence = await getOccurrenceById(id)
    if (!occurrence) return notFound("Occurrence")

    if (occurrence.status !== OCCURRENCE_STATUS.ACTIVE) {
      return badRequest("Only active occurrences can be updated")
    }

    if (payload.applyEndAt) {
      const applyEndAt = new Date(payload.applyEndAt)
      if (Number.isNaN(applyEndAt.getTime()) || applyEndAt <= now()) {
        return badRequest("Application end date must be in the future")
      }
      occurrence.applyEndAt = applyEndAt
    }

    if (typeof payload.title === "string") {
      occurrence.title = payload.title.trim()
    }

    if (typeof payload.description === "string") {
      occurrence.description = payload.description.trim()
    }

    if (Array.isArray(payload.eligibleRollNumbers)) {
      const eligibleResult = await assertEligibleStudentRollNumbers(payload.eligibleRollNumbers)
      if (!eligibleResult.success) return eligibleResult

      occurrence.eligibleRollNumbers = eligibleResult.data.normalizedRollNumbers
      occurrence.eligibleStudentCount = eligibleResult.data.eligibleStudentCount
    }

    occurrence.updatedBy = user._id
    await occurrence.save()

    return success({
      occurrence: serializeOccurrence(occurrence),
    }, 200, "Occurrence updated successfully")
  }

  async getOccurrenceSelector() {
    await closeExpiredOccurrences()
    const occurrences = await OverallBestPerformerOccurrence.find({})
      .sort({ awardYear: -1, applyEndAt: -1, createdAt: -1 })
      .lean()

    const activeOccurrence = occurrences.find((item) => item.status === OCCURRENCE_STATUS.ACTIVE) || null

    return success({
      activeOccurrenceId: activeOccurrence?._id || null,
      occurrences: occurrences.map((item) => serializeOccurrence(item)),
    })
  }

  async getOccurrenceDetail(id) {
    const occurrence = await getOccurrenceById(id)
    if (!occurrence) return notFound("Occurrence")

    const applications = await OverallBestPerformerApplication.find({ occurrenceId: occurrence._id })
      .sort({ "review.finalScore": -1, "scoreBreakdown.total": -1, updatedAt: 1 })
      .lean()

    const leaderboard = applications
      .map((application) => serializeApplication(application))
      .sort((left, right) => right.finalScore - left.finalScore || right.calculatedTotal - left.calculatedTotal)

    const stats = {
      applicationCount: leaderboard.length,
      approvedCount: leaderboard.filter((item) => item.review?.status === APPLICATION_STATUS.APPROVED).length,
      rejectedCount: leaderboard.filter((item) => item.review?.status === APPLICATION_STATUS.REJECTED).length,
      highestScore: leaderboard[0]?.finalScore || leaderboard[0]?.calculatedTotal || 0,
    }

    return success({
      occurrence: serializeOccurrence(occurrence, stats),
      leaderboard,
    })
  }

  async getStudentPortalState(user) {
    const profile = await getStudentProfileForUser(user._id)
    if (!profile) return notFound("Student profile")

    const student = {
      name: profile.userId?.name || "",
      email: profile.userId?.email || "",
      rollNumber: profile.rollNumber || "",
      department: profile.department || "",
      degree: profile.degree || "",
    }

    const activeOccurrence = await getActiveOccurrence()
    if (activeOccurrence) {
      const currentApplication = await OverallBestPerformerApplication.findOne({
        occurrenceId: activeOccurrence._id,
        studentUserId: user._id,
      })

      const normalizedRollNumber = String(profile.rollNumber || "").toUpperCase()
      const isEligible = activeOccurrence.eligibleRollNumbers.includes(normalizedRollNumber)
      const hasApplied = Boolean(currentApplication)

      return success({
        canAccessPortal: isEligible || hasApplied,
        isEligible,
        hasApplied,
        canEdit: now() <= new Date(activeOccurrence.applyEndAt) && (!currentApplication || currentApplication.review?.status === APPLICATION_STATUS.SUBMITTED),
        student,
        occurrence: serializeOccurrence(activeOccurrence),
        application: serializeApplication(currentApplication),
      })
    }

    const latestApplied = await getLatestAppliedOccurrenceForStudent(user._id)
    if (!latestApplied.occurrence) {
      return success({
        canAccessPortal: false,
        isEligible: false,
        hasApplied: false,
        canEdit: false,
        student,
        occurrence: null,
        application: null,
      })
    }

    return success({
      canAccessPortal: true,
      isEligible: false,
      hasApplied: true,
      canEdit: false,
      student,
      occurrence: serializeOccurrence(latestApplied.occurrence),
      application: serializeApplication(latestApplied.application),
    })
  }

  async upsertStudentApplication(occurrenceId, payload, user) {
    const occurrence = await getOccurrenceById(occurrenceId)
    if (!occurrence) return notFound("Occurrence")

    const profile = await getStudentProfileForUser(user._id)
    if (!profile) return notFound("Student profile")

    const editWindowOpen = now() <= new Date(occurrence.applyEndAt)
    if (!editWindowOpen) {
      return badRequest("The application deadline has passed")
    }

    const normalizedRollNumber = String(profile.rollNumber || "").toUpperCase()
    const existingApplication = await OverallBestPerformerApplication.findOne({
      occurrenceId: occurrence._id,
      studentUserId: user._id,
    })

    const isEligible = occurrence.eligibleRollNumbers.includes(normalizedRollNumber)
    if (!isEligible && !existingApplication) {
      return forbidden("You are not eligible to apply for this occurrence")
    }

    if (
      existingApplication &&
      [APPLICATION_STATUS.APPROVED, APPLICATION_STATUS.REJECTED].includes(existingApplication.review?.status)
    ) {
      return badRequest("Reviewed applications can no longer be edited")
    }

    const computed = computeBreakdown(payload)
    const application = existingApplication || new OverallBestPerformerApplication({
      occurrenceId: occurrence._id,
      studentUserId: user._id,
      studentProfileId: profile._id,
      awardYear: occurrence.awardYear,
      studentName: profile.userId?.name || "",
      studentEmail: profile.userId?.email || "",
      rollNumber: normalizedRollNumber,
      department: profile.department || "",
      degree: profile.degree || "",
    })

    application.studentName = profile.userId?.name || application.studentName
    application.studentEmail = profile.userId?.email || application.studentEmail
    application.rollNumber = normalizedRollNumber
    application.department = profile.department || payload.personalAcademic?.department || ""
    application.degree = profile.degree || application.personalAcademic?.programme || ""
    application.personalAcademic = computed.personalAcademic
    application.coursework = computed.coursework
    application.projectThesis = computed.projectThesis
    application.responsibilityItems = computed.responsibilityItems
    application.awardItems = computed.awardItems
    application.culturalItems = computed.culturalItems
    application.scienceTechnologyItems = computed.scienceTechnologyItems
    application.gamesSportsItems = computed.gamesSportsItems
    application.coCurricularItems = computed.coCurricularItems
    application.scoreBreakdown = computed.scoreBreakdown
    application.review = {
      ...application.review,
      status: APPLICATION_STATUS.SUBMITTED,
      remarks: "",
      reviewedBy: null,
      reviewedAt: null,
      finalScore: computed.scoreBreakdown.total,
    }
    application.submittedAt = application.submittedAt || now()

    await application.save()

    return success({
      application: serializeApplication(application),
      occurrence: serializeOccurrence(occurrence),
    }, 200, existingApplication ? "Application updated successfully" : "Application submitted successfully")
  }

  async reviewApplication(applicationId, payload, user) {
    const application = await OverallBestPerformerApplication.findById(applicationId)
    if (!application) return notFound("Application")

    const occurrence = await getOccurrenceById(application.occurrenceId)
    if (!occurrence) return notFound("Occurrence")

    if (now() <= new Date(occurrence.applyEndAt)) {
      return badRequest("Applications can be reviewed only after the deadline")
    }

    const decision = payload.decision === APPLICATION_STATUS.REJECTED
      ? APPLICATION_STATUS.REJECTED
      : APPLICATION_STATUS.APPROVED

    application.review = {
      status: decision,
      remarks: String(payload.remarks || "").trim(),
      reviewedBy: user._id,
      reviewedAt: now(),
      finalScore: decision === APPLICATION_STATUS.REJECTED
        ? 0
        : Number(application.scoreBreakdown?.total || 0),
    }

    await application.save()

    return success({
      application: serializeApplication(application),
    }, 200, decision === APPLICATION_STATUS.REJECTED ? "Application rejected" : "Application approved")
  }
}

export const bestPerformerService = new BestPerformerService()
export default bestPerformerService
