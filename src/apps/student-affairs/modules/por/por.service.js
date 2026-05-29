import { BaseService } from "../../../../services/base/BaseService.js"
import {
  badRequest,
  created,
  forbidden,
  notFound,
  success,
} from "../../../../services/base/ServiceResponse.js"
import PorRequest from "../../../../models/club/PorRequest.model.js"
import PorCategory from "../../../../models/club/PorCategory.model.js"
import Club from "../../../../models/club/Club.model.js"
import ApprovalLog from "../../../../models/event/ApprovalLog.model.js"
import StudentProfile from "../../../../models/student/StudentProfile.model.js"
import Gymkhana from "../../../../models/user/Gymkhana.model.js"
import User from "../../../../models/user/User.model.js"
import { ROLES, SUBROLES } from "../../../../core/constants/roles.constants.js"
import logger from "../../../../services/base/Logger.js"
import { emailService } from "../../../../services/email/index.js"
import {
  getGlobalGymkhanaCategoryDefinitions,
  normalizeCategoryKey,
} from "../events/category-definitions.utils.js"
import {
  clearCustomApprovalAssignments,
  getCustomAssignmentState,
  getPostStudentAffairsApproverOptionsByStage,
  normalizeObjectId,
  resolvePostStudentAffairsAssignments,
} from "../events/approval-assignments.utils.js"
import {
  POR_APPROVAL_ACTIONS,
  POR_APPROVAL_STAGES,
  POR_APPROVER_TO_STATUS,
  POR_STATUS,
} from "./por.constants.js"

const normalizeText = (value = "") => String(value || "").trim()

const normalizeOptionalText = (value = "") => {
  const normalized = normalizeText(value)
  return normalized || ""
}

const normalizeUserIdList = (values = []) =>
  [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeObjectId(value)).filter(Boolean))]

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const formatStageLabel = (stage) => {
  if (stage === POR_APPROVAL_STAGES.STUDENT_AFFAIRS) return "Office - Student Affairs"
  return stage || "POR Workflow"
}

const buildCategoryLookup = async () => {
  const gymkhanaCategories = await getGlobalGymkhanaCategoryDefinitions()
  const categoriesByKey = new Map()

  const normalizedCategories = gymkhanaCategories
    .map((category) => ({
      key: normalizeCategoryKey(category?.key),
      label: normalizeText(category?.label) || normalizeCategoryKey(category?.key),
    }))
    .filter((category) => category.key && category.label)

  for (const category of normalizedCategories) {
    categoriesByKey.set(category.key, category.label)
  }

  return { gymkhanaCategories: normalizedCategories, categoriesByKey }
}

const sortByName = (items = [], getName = (item) => item?.name) =>
  [...items].sort((left, right) =>
    normalizeText(getName(left)).toLowerCase().localeCompare(normalizeText(getName(right)).toLowerCase())
  )

const resolveViewerMode = (user) => {
  if (!user) return "unknown"
  if (user.role === ROLES.STUDENT) return "student"

  if (user.role === ROLES.GYMKHANA) {
    if (user.subRole === SUBROLES.CLUB) return "club"
    if (user.subRole === SUBROLES.GS_GYMKHANA) return "gs"
    if (user.subRole === SUBROLES.PRESIDENT_GYMKHANA) return "president"
    return "gymkhana"
  }

  if (user.role === ROLES.ADMIN) {
    if (user.subRole === SUBROLES.STUDENT_AFFAIRS) return "student_affairs"
    if (
      [SUBROLES.OFFICER_SA, SUBROLES.ASSOCIATE_DEAN_SA, SUBROLES.DEAN_SA].includes(
        user.subRole
      )
    ) {
      return "post_student_affairs"
    }
    return "admin_other"
  }

  return "unknown"
}

const isGymkhanaViewerMode = (mode) =>
  ["club", "gs", "president", "gymkhana"].includes(mode)

const isPostStudentAffairsStage = (stage) =>
  [
    POR_APPROVAL_STAGES.OFFICER_SA,
    POR_APPROVAL_STAGES.ASSOCIATE_DEAN_SA,
    POR_APPROVAL_STAGES.DEAN_SA,
  ].includes(stage)

const cloneGymkhanaSteps = (steps = []) =>
  (Array.isArray(steps) ? steps : [])
    .map((step) => ({
      label: normalizeText(step?.label),
      reviewerUserIds: normalizeUserIdList(step?.reviewerUserIds),
    }))
    .filter((step) => step.label && step.reviewerUserIds.length > 0)

const getFirstReviewerId = (reviewerUserIds = []) => normalizeUserIdList(reviewerUserIds)[0] || null

const findNextGymkhanaStep = (steps = [], startIndex = 0) => {
  const safeSteps = Array.isArray(steps) ? steps : []
  for (let index = Math.max(0, Number(startIndex || 0)); index < safeSteps.length; index += 1) {
    const reviewerUserIds = normalizeUserIdList(safeSteps[index]?.reviewerUserIds)
    const label = normalizeText(safeSteps[index]?.label)
    if (!label || reviewerUserIds.length === 0) continue
    return {
      index,
      step: {
        label,
        reviewerUserIds,
      },
    }
  }

  return null
}

const getCurrentApproverUserIds = (request) => {
  const userIds = normalizeUserIdList(request?.currentApproverUsers)
  if (userIds.length > 0) return userIds

  const legacyUserId = normalizeObjectId(request?.currentApproverUser)
  return legacyUserId ? [legacyUserId] : []
}

const resolveGymkhanaStepIndex = (request, gymkhanaSteps = []) => {
  if (Number.isInteger(request?.currentGymkhanaStepIndex) && request.currentGymkhanaStepIndex >= 0) {
    return request.currentGymkhanaStepIndex
  }

  const currentStage = normalizeText(request?.currentApprovalStage)
  if (!currentStage) return 0

  const stageIndex = (Array.isArray(gymkhanaSteps) ? gymkhanaSteps : []).findIndex(
    (step) => normalizeText(step?.label) === currentStage
  )

  return stageIndex >= 0 ? stageIndex : 0
}

class PorService extends BaseService {
  constructor() {
    super(PorRequest, "PorRequest")
  }

  async getWorkspace(user) {
    const viewerContext = await this.getViewerContext(user)
    if (!viewerContext.supported) {
      return success({
        viewer: viewerContext.viewer,
        porCategories: [],
        requests: [],
        stats: [],
        approversByStage: {},
        gymkhanaReviewerOptions: [],
      })
    }

    const categoryLookup = await buildCategoryLookup()
    await this.ensureLegacyPorCategories(categoryLookup.categoriesByKey)

    const [porCategories, requests, approversByStage, gymkhanaReviewerOptions] = await Promise.all([
      this.getPorCategoriesForWorkspace({
        includeStepReviewers: Boolean(viewerContext.viewer.canManageCategories),
      }),
      this.getAccessibleRequests(user, viewerContext, categoryLookup.categoriesByKey),
      viewerContext.viewer.canSelectPostApprovers
        ? getPostStudentAffairsApproverOptionsByStage()
        : Promise.resolve({}),
      viewerContext.viewer.canManageCategories
        ? this.getGymkhanaReviewerOptions()
        : Promise.resolve([]),
    ])

    const serializedRequests = await this.serializeRequests(
      requests,
      user,
      viewerContext,
      categoryLookup.categoriesByKey
    )
    const stats = this.buildStats(serializedRequests, viewerContext)

    return success(
      {
        viewer: viewerContext.viewer,
        porCategories:
          viewerContext.viewer.canCreate || viewerContext.viewer.canManageCategories
            ? porCategories
            : [],
        requests: serializedRequests,
        stats,
        approversByStage,
        gymkhanaReviewerOptions,
      },
      200,
      "POR workspace loaded successfully"
    )
  }

  async getStudentPorRequests(targetUserId, user) {
    const viewerContext = await this.getViewerContext(user)
    if (!viewerContext.supported || viewerContext.mode === "student") {
      return forbidden("You cannot view POR requests for this student")
    }

    const { categoriesByKey } = await buildCategoryLookup()
    await this.ensureLegacyPorCategories(categoriesByKey)

    const requests = await this.model.find({ submittedBy: targetUserId }).sort({ updatedAt: -1 })

    for (const request of requests) {
      await this.migrateLegacyRequestIfNeeded(request, categoriesByKey)
    }

    await this.model.populate(requests, [
      { path: "submittedBy", select: "name email" },
      { path: "rejectedBy", select: "name email subRole" },
      { path: "currentApproverUser", select: "name email subRole" },
      { path: "currentApproverUsers", select: "name email subRole" },
      { path: "clubId", select: "name email gymkhanaCategoryKey userId" },
      { path: "porCategoryId", select: "name" },
    ])

    const serializedRequests = await this.serializeRequests(
      requests,
      user,
      viewerContext,
      categoriesByKey
    )

    const approversByStage = viewerContext.viewer.canSelectPostApprovers
      ? await getPostStudentAffairsApproverOptionsByStage()
      : {}

    return success(
      {
        viewer: viewerContext.viewer,
        requests: serializedRequests,
        approversByStage,
      },
      200,
      "Student POR requests loaded successfully"
    )
  }

  async createPorCategory(data, user) {
    if (user?.role !== ROLES.ADMIN) {
      return forbidden("Only admin users can manage POR categories")
    }

    const normalized = await this.normalizePorCategoryPayload(data)
    if (!normalized.success) {
      return badRequest(normalized.message)
    }

    const duplicate = await this.findPorCategoryByName(normalized.value.name)
    if (duplicate) {
      return badRequest("A POR category with that name already exists")
    }

    const category = await PorCategory.create({
      name: normalized.value.name,
      gymkhanaSteps: normalized.value.gymkhanaSteps,
      createdBy: user._id,
      updatedBy: user._id,
    })

    return created(
      {
        category: await this.serializePorCategoryById(category._id),
      },
      "POR category created successfully"
    )
  }

  async updatePorCategory(categoryId, data, user) {
    if (user?.role !== ROLES.ADMIN) {
      return forbidden("Only admin users can manage POR categories")
    }

    const category = await PorCategory.findById(categoryId)
    if (!category) {
      return notFound("POR category")
    }

    const normalized = await this.normalizePorCategoryPayload(data)
    if (!normalized.success) {
      return badRequest(normalized.message)
    }

    const duplicate = await this.findPorCategoryByName(normalized.value.name, categoryId)
    if (duplicate) {
      return badRequest("A POR category with that name already exists")
    }

    category.name = normalized.value.name
    category.gymkhanaSteps = normalized.value.gymkhanaSteps
    category.updatedBy = user._id
    await category.save()

    return success(
      {
        category: await this.serializePorCategoryById(category._id),
      },
      200,
      "POR category updated successfully"
    )
  }

  async createPorRequest(data, user) {
    if (user?.role !== ROLES.STUDENT) {
      return forbidden("Only students can create POR requests")
    }

    const studentProfile = await StudentProfile.findOne({ userId: user._id }).select("_id rollNumber")
    if (!studentProfile) {
      return notFound("Student profile")
    }

    const categoryResolution = await this.resolvePorCategoryForSubmission(data.porCategoryId)
    if (!categoryResolution.success) {
      return categoryResolution.response
    }

    const firstStep = findNextGymkhanaStep(categoryResolution.category.gymkhanaSteps, 0)
    if (!firstStep) {
      return badRequest("Selected POR category does not have a valid Gymkhana review chain")
    }

    const porRequest = await this.model.create({
      submittedBy: user._id,
      clubId: null,
      porCategoryId: categoryResolution.category._id,
      porCategoryNameSnapshot: categoryResolution.category.name,
      gymkhanaCategoryKey: normalizeCategoryKey(categoryResolution.category.legacyGymkhanaCategoryKey),
      gymkhanaApprovalSteps: categoryResolution.category.gymkhanaSteps,
      currentGymkhanaStepIndex: firstStep.index,
      hasDisciplinaryAction: Boolean(data.hasDisciplinaryAction),
      disciplinaryActionDetails: data.hasDisciplinaryAction
        ? normalizeOptionalText(data.disciplinaryActionDetails)
        : "",
      positionTitle: normalizeText(data.positionTitle),
      positionDetails: normalizeText(data.positionDetails),
      tenure: normalizeText(data.tenure),
      supportingDocumentUrl: normalizeOptionalText(data.supportingDocumentUrl),
      supportingDocumentName: normalizeOptionalText(data.supportingDocumentName),
      undertakingAccepted: Boolean(data.undertakingAccepted),
      status: POR_STATUS.PENDING_GYMKHANA,
      currentApprovalStage: firstStep.step.label,
      currentApproverUser: getFirstReviewerId(firstStep.step.reviewerUserIds),
      currentApproverUsers: firstStep.step.reviewerUserIds,
      customApprovalChain: [],
      currentChainIndex: null,
      customApprovalAssignments: [],
    })

    const submissionComment = studentProfile.rollNumber
      ? `Submitted by ${studentProfile.rollNumber}`
      : ""

    await ApprovalLog.create({
      entityType: "PorRequest",
      entityId: porRequest._id,
      stage: POR_APPROVAL_STAGES.STUDENT,
      action: POR_APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
      comments: submissionComment,
    })

    await this.notifyNextPorReviewers({
      porRequestId: porRequest._id,
      movedByUser: user,
      movedFromStage: POR_APPROVAL_STAGES.STUDENT,
      comments: submissionComment,
      trigger: "submitted",
    })

    const serializedRequest = await this.getSerializedRequestById(
      porRequest._id,
      user,
      await this.getViewerContext(user)
    )

    return created(
      {
        request: serializedRequest,
      },
      "POR request submitted successfully"
    )
  }

  async updatePorRequest(id, data, user) {
    const porRequest = await this.model.findById(id)
    if (!porRequest) {
      return notFound("POR request")
    }

    await this.migrateLegacyRequestIfNeeded(porRequest)

    if (normalizeObjectId(porRequest.submittedBy) !== normalizeObjectId(user._id)) {
      return forbidden("You can only update your own POR request")
    }

    if (porRequest.status !== POR_STATUS.REVISION_REQUESTED) {
      return badRequest("Only POR requests needing modification can be updated")
    }

    const categoryResolution = await this.resolvePorCategoryForSubmission(data.porCategoryId)
    if (!categoryResolution.success) {
      return categoryResolution.response
    }

    const firstStep = findNextGymkhanaStep(categoryResolution.category.gymkhanaSteps, 0)
    if (!firstStep) {
      return badRequest("Selected POR category does not have a valid Gymkhana review chain")
    }

    porRequest.clubId = null
    porRequest.porCategoryId = categoryResolution.category._id
    porRequest.porCategoryNameSnapshot = categoryResolution.category.name
    porRequest.gymkhanaCategoryKey = normalizeCategoryKey(categoryResolution.category.legacyGymkhanaCategoryKey)
    porRequest.gymkhanaApprovalSteps = categoryResolution.category.gymkhanaSteps
    porRequest.currentGymkhanaStepIndex = firstStep.index
    porRequest.hasDisciplinaryAction = Boolean(data.hasDisciplinaryAction)
    porRequest.disciplinaryActionDetails = data.hasDisciplinaryAction
      ? normalizeOptionalText(data.disciplinaryActionDetails)
      : ""
    porRequest.positionTitle = normalizeText(data.positionTitle)
    porRequest.positionDetails = normalizeText(data.positionDetails)
    porRequest.tenure = normalizeText(data.tenure)
    porRequest.supportingDocumentUrl = normalizeOptionalText(data.supportingDocumentUrl)
    porRequest.supportingDocumentName = normalizeOptionalText(data.supportingDocumentName)
    porRequest.undertakingAccepted = Boolean(data.undertakingAccepted)
    porRequest.status = POR_STATUS.PENDING_GYMKHANA
    porRequest.currentApprovalStage = firstStep.step.label
    porRequest.currentApproverUser = getFirstReviewerId(firstStep.step.reviewerUserIds)
    porRequest.currentApproverUsers = firstStep.step.reviewerUserIds
    porRequest.customApprovalChain = []
    porRequest.currentChainIndex = null
    clearCustomApprovalAssignments(porRequest)
    porRequest.revisionCount += 1
    porRequest.rejectionReason = null
    porRequest.rejectedBy = null
    porRequest.rejectedAt = null
    porRequest.approvedAt = null
    await porRequest.save()

    const revisionComment = `Revision #${porRequest.revisionCount}`

    await ApprovalLog.create({
      entityType: "PorRequest",
      entityId: porRequest._id,
      stage: POR_APPROVAL_STAGES.STUDENT,
      action: POR_APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
      comments: revisionComment,
    })

    await this.notifyNextPorReviewers({
      porRequestId: porRequest._id,
      movedByUser: user,
      movedFromStage: POR_APPROVAL_STAGES.STUDENT,
      comments: revisionComment,
      trigger: "submitted",
    })

    return success(
      {
        request: await this.getSerializedRequestById(
          porRequest._id,
          user,
          await this.getViewerContext(user)
        ),
      },
      200,
      "POR request resubmitted successfully"
    )
  }

  async getPorRequestEmailContext(porRequestId) {
    const request = await this.model
      .findById(porRequestId)
      .populate("submittedBy", "name email")
      .populate("currentApproverUser", "name email subRole role")
      .populate("currentApproverUsers", "name email subRole role")
      .populate("clubId", "name email gymkhanaCategoryKey userId")
      .populate("porCategoryId", "name")
      .lean()

    if (!request) return null

    return {
      request,
      student: request.submittedBy || null,
      club: request.clubId || null,
      porCategoryName:
        normalizeText(request.porCategoryNameSnapshot) ||
        normalizeText(request.porCategoryId?.name) ||
        "POR Category",
    }
  }

  buildPorEmailTitle(context) {
    const positionTitle = normalizeText(context?.request?.positionTitle) || "POR Request"
    const studentName = normalizeText(context?.student?.name) || "Student"
    return `${positionTitle} - ${studentName}`
  }

  async resolveNextPorReviewerRecipients(context) {
    const request = context?.request
    const nextStage = request?.currentApprovalStage
    if (!request || !nextStage || request.status === POR_STATUS.APPROVED) return []

    const currentApproverUsers = Array.isArray(request.currentApproverUsers)
      ? request.currentApproverUsers
      : []

    const explicitApprovers = currentApproverUsers
      .filter((user) => user && normalizeText(user.email))
      .map((user) => ({
        name: user.name,
        email: user.email,
        role: user.role,
        subRole: user.subRole,
      }))

    if (explicitApprovers.length > 0) {
      return explicitApprovers
    }

    const explicitApproverIds = normalizeUserIdList(currentApproverUsers)
    if (explicitApproverIds.length > 0) {
      return User.find({ _id: { $in: explicitApproverIds } })
        .select("name email role subRole")
        .lean()
    }

    if (request.currentApproverUser?.email) {
      return [request.currentApproverUser]
    }

    if (nextStage === POR_APPROVAL_STAGES.STUDENT_AFFAIRS) {
      return User.find({
        role: ROLES.ADMIN,
        subRole: SUBROLES.STUDENT_AFFAIRS,
      })
        .select("name email role subRole")
        .lean()
    }

    if (isPostStudentAffairsStage(nextStage) && request.currentApproverUser?._id) {
      return User.find({ _id: request.currentApproverUser._id })
        .select("name email role subRole")
        .lean()
    }

    return []
  }

  async notifyNextPorReviewers({
    porRequestId,
    movedByUser,
    movedFromStage,
    comments = "",
    trigger = "recommended",
  }) {
    try {
      const context = await this.getPorRequestEmailContext(porRequestId)
      if (!context?.request) return

      const recipients = await this.resolveNextPorReviewerRecipients(context)
      const emails = [
        ...new Set(
          recipients
            .map((recipient) => normalizeText(recipient?.email).toLowerCase())
            .filter(Boolean)
        ),
      ]

      if (emails.length === 0) return

      const requestTitle = this.buildPorEmailTitle(context)
      const nextStageLabel = formatStageLabel(context.request.currentApprovalStage)
      const movedFromLabel = formatStageLabel(movedFromStage)
      const movedByName = normalizeText(movedByUser?.name) || "Previous reviewer"
      const movedByRole = normalizeText(movedByUser?.subRole || movedByUser?.role) || movedFromLabel
      const safeComments = normalizeOptionalText(comments)
      const actionText = trigger === "submitted" ? "submitted" : "recommended"

      const categoryBlock = `<p><strong>POR Category:</strong> ${escapeHtml(
        context.porCategoryName || "POR Category"
      )}</p>`
      const clubBlock = context.club?.name
        ? `<p><strong>Club:</strong> ${escapeHtml(context.club.name)}</p>`
        : ""
      const commentsBlock = safeComments
        ? `<p><strong>Comments:</strong><br />${escapeHtml(safeComments)}</p>`
        : ""

      const body = `
        <p>Dear Reviewer,</p>
        <p>A POR verification request has been ${escapeHtml(actionText)} and is now pending at your stage.</p>
        <div class="info-box">
          <p><strong>Request:</strong> ${escapeHtml(requestTitle)}</p>
          <p><strong>Student:</strong> ${escapeHtml(context.student?.name || "Student")} (${escapeHtml(context.student?.email || "No email")})</p>
          ${categoryBlock}
          ${clubBlock}
          <p><strong>Your role/stage:</strong> ${escapeHtml(nextStageLabel)}</p>
          <p><strong>Moved by:</strong> ${escapeHtml(movedByName)} (${escapeHtml(movedByRole)})</p>
        </div>
        ${commentsBlock}
        <p>Please log in to HMS and review this POR request from your POR workspace.</p>
      `

      const result = await emailService.sendCustomEmail({
        to: emails,
        subject: `POR review required: ${requestTitle}`,
        body,
        useTemplate: true,
      })

      if (!result?.success) {
        logger.error("Failed to send POR reviewer notification", {
          porRequestId: String(porRequestId),
          nextStage: context.request.currentApprovalStage,
          recipients: emails,
          error: result?.error || result?.errors?.join("; ") || "Unknown email error",
        })
      }
    } catch (error) {
      logger.error("Error sending POR reviewer notification", {
        porRequestId: String(porRequestId || ""),
        error: error?.message || "Unknown error",
      })
    }
  }

  async notifyPorStudent({
    porRequestId,
    action,
    performedBy,
    stage,
    comments = "",
  }) {
    try {
      const context = await this.getPorRequestEmailContext(porRequestId)
      const studentEmail = normalizeText(context?.student?.email).toLowerCase()
      if (!context?.request || !studentEmail) return

      const requestTitle = this.buildPorEmailTitle(context)
      const safeComments = normalizeOptionalText(comments)
      const stageLabel = formatStageLabel(stage)
      const performedByName = normalizeText(performedBy?.name) || "Reviewer"
      const performedByRole = normalizeText(performedBy?.subRole || performedBy?.role) || stageLabel

      const actionMeta = {
        approved: {
          subject: `POR approved: ${requestTitle}`,
          heading: "Your POR request has been approved",
          description: "Your POR verification request has received final approval.",
          boxClass: "success-box",
        },
        rejected: {
          subject: `POR rejected: ${requestTitle}`,
          heading: "Your POR request has been rejected",
          description: "Your POR verification request was rejected during review.",
          boxClass: "warning",
        },
        revision_requested: {
          subject: `Modification required: ${requestTitle}`,
          heading: "Modification required for your POR request",
          description: "A reviewer has requested changes before this POR request can continue.",
          boxClass: "warning",
        },
      }[action]

      if (!actionMeta) return

      const commentsBlock = safeComments
        ? `<p><strong>Reviewer comments:</strong><br />${escapeHtml(safeComments)}</p>`
        : ""
      const clubBlock = context.club?.name
        ? `<p><strong>Club:</strong> ${escapeHtml(context.club.name)}</p>`
        : ""

      const body = `
        <p>Hello ${escapeHtml(context.student?.name || "Student")},</p>
        <p>${escapeHtml(actionMeta.description)}</p>
        <div class="${actionMeta.boxClass}">
          <p><strong>Request:</strong> ${escapeHtml(requestTitle)}</p>
          <p><strong>POR Category:</strong> ${escapeHtml(context.porCategoryName || "POR Category")}</p>
          ${clubBlock}
          <p><strong>Stage:</strong> ${escapeHtml(stageLabel)}</p>
          <p><strong>Reviewed by:</strong> ${escapeHtml(performedByName)} (${escapeHtml(performedByRole)})</p>
        </div>
        ${commentsBlock}
        <p>Please log in to HMS to view the latest status in your POR workspace.</p>
      `

      const result = await emailService.sendCustomEmail({
        to: studentEmail,
        subject: actionMeta.subject,
        body: `<h2>${escapeHtml(actionMeta.heading)}</h2>${body}`,
        useTemplate: true,
      })

      if (!result?.success) {
        logger.error("Failed to send POR student notification", {
          porRequestId: String(porRequestId),
          action,
          studentEmail,
          error: result?.error || "Unknown email error",
        })
      }
    } catch (error) {
      logger.error("Error sending POR student notification", {
        porRequestId: String(porRequestId || ""),
        action,
        error: error?.message || "Unknown error",
      })
    }
  }

  async approvePorRequest(id, comments, user, nextApprovalStages = [], nextApprovers = [], directApprove = false) {
    const porRequest = await this.model.findById(id)
    if (!porRequest) {
      return notFound("POR request")
    }

    await this.migrateLegacyRequestIfNeeded(porRequest)

    const viewerContext = await this.getViewerContext(user)
    const actionAccess = this.getActionAccess(porRequest, user, viewerContext)
    if (!actionAccess.canAct) {
      return forbidden(actionAccess.message || "You cannot approve this POR request")
    }

    const currentStage = actionAccess.stage
    const normalizedComments = normalizeOptionalText(comments)
    const shouldDirectApproveFromStudentAffairs =
      currentStage === POR_APPROVAL_STAGES.STUDENT_AFFAIRS && Boolean(directApprove)
    const normalizedNextApproverCount = Array.isArray(nextApprovers)
      ? nextApprovers.filter((assignment) => assignment && assignment.userId).length
      : 0
    const normalizedNextStageCount = Array.isArray(nextApprovalStages)
      ? nextApprovalStages.filter(Boolean).length
      : 0

    if (currentStage === POR_APPROVAL_STAGES.STUDENT_AFFAIRS) {
      if (shouldDirectApproveFromStudentAffairs && (normalizedNextApproverCount > 0 || normalizedNextStageCount > 0)) {
        return badRequest("Direct approval from Student Affairs is only allowed when no next recommender is selected")
      }

      if (!shouldDirectApproveFromStudentAffairs && normalizedNextApproverCount === 0 && normalizedNextStageCount === 0) {
        return badRequest("Select at least one next recommender before forwarding from Student Affairs")
      }
    }

    if (shouldDirectApproveFromStudentAffairs) {
      porRequest.status = POR_STATUS.APPROVED
      porRequest.currentApprovalStage = null
      porRequest.currentChainIndex = null
      porRequest.currentApproverUser = null
      porRequest.currentApproverUsers = []
      porRequest.customApprovalChain = []
      clearCustomApprovalAssignments(porRequest)
    } else if (currentStage === POR_APPROVAL_STAGES.STUDENT_AFFAIRS) {
      const assignmentResolution = await resolvePostStudentAffairsAssignments(
        nextApprovers,
        nextApprovalStages
      )
      if (!assignmentResolution.success) {
        return badRequest(assignmentResolution.message)
      }

      const firstStage = assignmentResolution.chain[0]
      porRequest.customApprovalChain = assignmentResolution.chain
      porRequest.customApprovalAssignments = assignmentResolution.assignments
      porRequest.currentChainIndex = 0
      porRequest.status = POR_APPROVER_TO_STATUS[firstStage]
      porRequest.currentApprovalStage = firstStage
      porRequest.currentApproverUser = assignmentResolution.currentApproverUser
      porRequest.currentApproverUsers = assignmentResolution.currentApproverUser
        ? [assignmentResolution.currentApproverUser]
        : []
    } else if (isPostStudentAffairsStage(currentStage)) {
      const assignmentState = getCustomAssignmentState(porRequest, currentStage)
      if (assignmentState.currentIndex === -1 || !assignmentState.currentAssignment) {
        return badRequest("Assigned approval flow is misconfigured for this POR request")
      }

      const nextAssignment = assignmentState.nextAssignment
      if (!nextAssignment) {
        porRequest.status = POR_STATUS.APPROVED
        porRequest.currentApprovalStage = null
        porRequest.currentChainIndex = null
        porRequest.currentApproverUser = null
        porRequest.currentApproverUsers = []
      } else {
        porRequest.status = POR_APPROVER_TO_STATUS[nextAssignment.stage]
        porRequest.currentApprovalStage = nextAssignment.stage
        porRequest.currentChainIndex = assignmentState.currentIndex + 1
        porRequest.currentApproverUser = normalizeObjectId(nextAssignment.userId)
        porRequest.currentApproverUsers = normalizeObjectId(nextAssignment.userId)
          ? [normalizeObjectId(nextAssignment.userId)]
          : []
      }
    } else if (porRequest.status === POR_STATUS.PENDING_GYMKHANA) {
      const currentIndex = Number.isInteger(porRequest.currentGymkhanaStepIndex)
        ? porRequest.currentGymkhanaStepIndex
        : 0
      const nextStep = findNextGymkhanaStep(porRequest.gymkhanaApprovalSteps, currentIndex + 1)

      if (nextStep) {
        porRequest.status = POR_STATUS.PENDING_GYMKHANA
        porRequest.currentGymkhanaStepIndex = nextStep.index
        porRequest.currentApprovalStage = nextStep.step.label
        porRequest.currentApproverUsers = nextStep.step.reviewerUserIds
        porRequest.currentApproverUser = getFirstReviewerId(nextStep.step.reviewerUserIds)
      } else {
        porRequest.status = POR_STATUS.PENDING_STUDENT_AFFAIRS
        porRequest.currentApprovalStage = POR_APPROVAL_STAGES.STUDENT_AFFAIRS
        porRequest.currentApproverUser = null
        porRequest.currentApproverUsers = []
        porRequest.currentChainIndex = null
        porRequest.customApprovalChain = []
        clearCustomApprovalAssignments(porRequest)
      }
    } else {
      return badRequest("POR request is not at an approvable stage")
    }

    if (porRequest.status === POR_STATUS.APPROVED) {
      porRequest.approvedAt = new Date()
      porRequest.currentApprovalStage = null
      porRequest.currentChainIndex = null
      porRequest.currentApproverUser = null
      porRequest.currentApproverUsers = []
    }

    await porRequest.save()

    const approvalLogAction =
      porRequest.status === POR_STATUS.APPROVED
        ? POR_APPROVAL_ACTIONS.APPROVED
        : POR_APPROVAL_ACTIONS.RECOMMENDED

    await ApprovalLog.create({
      entityType: "PorRequest",
      entityId: porRequest._id,
      stage: currentStage,
      action: approvalLogAction,
      performedBy: user._id,
      comments: normalizedComments,
    })

    if (porRequest.status === POR_STATUS.APPROVED) {
      await this.notifyPorStudent({
        porRequestId: porRequest._id,
        action: POR_APPROVAL_ACTIONS.APPROVED,
        performedBy: user,
        stage: currentStage,
        comments: normalizedComments,
      })
    } else {
      await this.notifyNextPorReviewers({
        porRequestId: porRequest._id,
        movedByUser: user,
        movedFromStage: currentStage,
        comments: normalizedComments,
        trigger: "recommended",
      })
    }

    return success(
      { request: porRequest },
      200,
      porRequest.status === POR_STATUS.APPROVED ? "POR request approved" : "POR request recommended"
    )
  }

  async rejectPorRequest(id, reason, user) {
    const porRequest = await this.model.findById(id)
    if (!porRequest) {
      return notFound("POR request")
    }

    await this.migrateLegacyRequestIfNeeded(porRequest)

    const viewerContext = await this.getViewerContext(user)
    const actionAccess = this.getActionAccess(porRequest, user, viewerContext)
    if (!actionAccess.canAct) {
      return forbidden(actionAccess.message || "You cannot reject this POR request")
    }

    const currentStage = actionAccess.stage
    porRequest.status = POR_STATUS.REJECTED
    porRequest.rejectionReason = normalizeText(reason)
    porRequest.rejectedBy = user._id
    porRequest.rejectedAt = new Date()
    porRequest.currentApprovalStage = null
    porRequest.currentApproverUser = null
    porRequest.currentApproverUsers = []
    porRequest.currentChainIndex = null
    clearCustomApprovalAssignments(porRequest)
    await porRequest.save()

    await ApprovalLog.create({
      entityType: "PorRequest",
      entityId: porRequest._id,
      stage: currentStage,
      action: POR_APPROVAL_ACTIONS.REJECTED,
      performedBy: user._id,
      comments: normalizeText(reason),
    })

    await this.notifyPorStudent({
      porRequestId: porRequest._id,
      action: POR_APPROVAL_ACTIONS.REJECTED,
      performedBy: user,
      stage: currentStage,
      comments: normalizeText(reason),
    })

    return success({ request: porRequest }, 200, "POR request rejected")
  }

  async requestPorRevision(id, comments, user) {
    const porRequest = await this.model.findById(id)
    if (!porRequest) {
      return notFound("POR request")
    }

    await this.migrateLegacyRequestIfNeeded(porRequest)

    const viewerContext = await this.getViewerContext(user)
    const actionAccess = this.getActionAccess(porRequest, user, viewerContext)
    if (!actionAccess.canAct) {
      return forbidden(actionAccess.message || "You cannot request changes for this POR request")
    }

    const currentStage = actionAccess.stage
    porRequest.status = POR_STATUS.REVISION_REQUESTED
    porRequest.rejectionReason = normalizeText(comments)
    porRequest.rejectedBy = user._id
    porRequest.rejectedAt = null
    porRequest.currentApprovalStage = POR_APPROVAL_STAGES.STUDENT
    porRequest.currentApproverUser = porRequest.submittedBy
    porRequest.currentApproverUsers = []
    porRequest.currentChainIndex = null
    clearCustomApprovalAssignments(porRequest)
    await porRequest.save()

    await ApprovalLog.create({
      entityType: "PorRequest",
      entityId: porRequest._id,
      stage: currentStage,
      action: POR_APPROVAL_ACTIONS.REVISION_REQUESTED,
      performedBy: user._id,
      comments: normalizeText(comments),
    })

    await this.notifyPorStudent({
      porRequestId: porRequest._id,
      action: POR_APPROVAL_ACTIONS.REVISION_REQUESTED,
      performedBy: user,
      stage: currentStage,
      comments: normalizeText(comments),
    })

    return success({ request: porRequest }, 200, "Modification requested")
  }

  async getApprovalHistory(id, user) {
    const porRequest = await this.model.findById(id).populate("clubId", "userId gymkhanaCategoryKey")
    if (!porRequest) {
      return notFound("POR request")
    }

    await this.migrateLegacyRequestIfNeeded(porRequest)

    const viewerContext = await this.getViewerContext(user)
    if (!this.canAccessRequest(porRequest, user, viewerContext)) {
      return forbidden("You cannot view this POR request")
    }

    const logs = await ApprovalLog.find({
      entityType: "PorRequest",
      entityId: id,
    })
      .sort({ createdAt: 1 })
      .populate("performedBy", "name email subRole")

    return success({ history: logs })
  }

  async getViewerContext(user) {
    const mode = resolveViewerMode(user)
    const viewer = {
      mode,
      role: user?.role || "",
      subRole: user?.subRole || "",
      canCreate: mode === "student",
      showStats: mode === "president" || mode === "student_affairs" || mode === "post_student_affairs",
      canSelectPostApprovers: mode === "student_affairs",
      canManageCategories: user?.role === ROLES.ADMIN,
    }

    if (mode === "student") {
      return { supported: true, viewer, mode }
    }

    if (mode === "club") {
      const club = await Club.findOne({ userId: user._id }).select("_id userId gymkhanaCategoryKey name").lean()
      const gymkhanaProfile = await Gymkhana.findOne({ userId: user._id }).select("categories").lean()
      return {
        supported: true,
        viewer,
        mode,
        clubId: normalizeObjectId(club?._id),
        clubUserId: normalizeObjectId(club?.userId),
        categoryKeys: Array.isArray(gymkhanaProfile?.categories)
          ? gymkhanaProfile.categories.map((category) => normalizeCategoryKey(category)).filter(Boolean)
          : [],
      }
    }

    if (mode === "gs" || mode === "gymkhana") {
      const gymkhanaProfile = await Gymkhana.findOne({ userId: user._id }).select("categories").lean()
      return {
        supported: true,
        viewer,
        mode,
        categoryKeys: Array.isArray(gymkhanaProfile?.categories)
          ? gymkhanaProfile.categories.map((category) => normalizeCategoryKey(category)).filter(Boolean)
          : [],
      }
    }

    if (
      mode === "president" ||
      mode === "student_affairs" ||
      mode === "post_student_affairs"
    ) {
      return { supported: true, viewer, mode }
    }

    return { supported: false, viewer, mode }
  }

  async normalizePorCategoryPayload(data = {}) {
    const name = normalizeText(data.name)
    if (!name) {
      return { success: false, message: "POR category name is required" }
    }

    const inputSteps = Array.isArray(data.gymkhanaSteps) ? data.gymkhanaSteps : []
    if (inputSteps.length === 0) {
      return { success: false, message: "At least one Gymkhana review step is required" }
    }

    const allReviewerUserIds = normalizeUserIdList(
      inputSteps.flatMap((step) => step?.reviewerUserIds || [])
    )
    const gymkhanaUsers = await User.find({
      _id: { $in: allReviewerUserIds },
      role: ROLES.GYMKHANA,
    })
      .select("_id")
      .lean()

    const validReviewerIds = new Set(gymkhanaUsers.map((user) => normalizeObjectId(user._id)))
    if (validReviewerIds.size !== allReviewerUserIds.length) {
      return { success: false, message: "Every reviewer must be an active Gymkhana user" }
    }

    const normalizedSteps = []
    for (let index = 0; index < inputSteps.length; index += 1) {
      const step = inputSteps[index]
      const label = normalizeText(step?.label)
      const reviewerUserIds = normalizeUserIdList(step?.reviewerUserIds)

      if (!label) {
        return { success: false, message: `Step ${index + 1} needs a label` }
      }

      if (reviewerUserIds.length === 0) {
        return { success: false, message: `Step ${index + 1} needs at least one Gymkhana reviewer` }
      }

      normalizedSteps.push({
        label,
        reviewerUserIds,
      })
    }

    return {
      success: true,
      value: {
        name,
        gymkhanaSteps: normalizedSteps,
      },
    }
  }

  async findPorCategoryByName(name, excludeId = null) {
    const query = {
      name: new RegExp(`^${escapeRegex(normalizeText(name))}$`, "i"),
    }

    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    return PorCategory.findOne(query).select("_id name").lean()
  }

  async resolvePorCategoryForSubmission(categoryId) {
    const category = await PorCategory.findById(categoryId).select(
      "_id name gymkhanaSteps legacyGymkhanaCategoryKey"
    )
    if (!category) {
      return { success: false, response: notFound("POR category") }
    }

    const gymkhanaSteps = cloneGymkhanaSteps(category.gymkhanaSteps)
    if (gymkhanaSteps.length === 0) {
      return {
        success: false,
        response: badRequest("Selected POR category does not have a valid Gymkhana review chain"),
      }
    }

    return {
      success: true,
      category: {
        _id: category._id,
        name: normalizeText(category.name),
        legacyGymkhanaCategoryKey: normalizeCategoryKey(category.legacyGymkhanaCategoryKey),
        gymkhanaSteps,
      },
    }
  }

  async getPorCategoriesForWorkspace({ includeStepReviewers = false } = {}) {
    const query = PorCategory.find().sort({ name: 1 })
    if (includeStepReviewers) {
      query.populate("gymkhanaSteps.reviewerUserIds", "name email subRole role")
    }

    const categories = await query.lean()

    return categories.map((category) => {
      const serializedSteps = (Array.isArray(category.gymkhanaSteps) ? category.gymkhanaSteps : [])
        .map((step) => {
          const reviewerUsers = Array.isArray(step?.reviewerUserIds)
            ? step.reviewerUserIds
            : []

          return {
            label: normalizeText(step?.label),
            reviewerUserIds: includeStepReviewers
              ? reviewerUsers
                  .map((user) => normalizeObjectId(user?._id))
                  .filter(Boolean)
              : normalizeUserIdList(reviewerUsers),
            reviewers: includeStepReviewers
              ? sortByName(reviewerUsers, (user) => user?.name).map((user) => ({
                  id: normalizeObjectId(user?._id),
                  name: normalizeText(user?.name),
                  email: normalizeText(user?.email).toLowerCase(),
                  role: normalizeText(user?.role),
                  subRole: normalizeText(user?.subRole),
                }))
              : [],
          }
        })
        .filter((step) => step.label && step.reviewerUserIds.length > 0)

      return {
        id: normalizeObjectId(category._id),
        name: normalizeText(category.name),
        stepCount: serializedSteps.length,
        gymkhanaSteps: serializedSteps,
        isLegacyMigrated: Boolean(category.isLegacyMigrated),
        legacyClubId: normalizeObjectId(category.legacyClubId),
      }
    })
  }

  async serializePorCategoryById(categoryId) {
    const categories = await this.getPorCategoriesForWorkspace({ includeStepReviewers: true })
    return categories.find((category) => category.id === normalizeObjectId(categoryId)) || null
  }

  async getGymkhanaReviewerOptions() {
    const users = await User.find({ role: ROLES.GYMKHANA })
      .select("_id name email role subRole")
      .sort({ name: 1 })
      .lean()

    return users.map((user) => ({
      id: normalizeObjectId(user._id),
      label: `${normalizeText(user.name)}${normalizeText(user.subRole) ? ` (${normalizeText(user.subRole)})` : ""}`,
      name: normalizeText(user.name),
      email: normalizeText(user.email).toLowerCase(),
      role: normalizeText(user.role),
      subRole: normalizeText(user.subRole),
    }))
  }

  async resolveGsGymkhanaReviewerUserIds(categoryKey) {
    const normalizedCategoryKey = normalizeCategoryKey(categoryKey)
    if (!normalizedCategoryKey) return []

    const gymkhanaProfiles = await Gymkhana.find({ categories: normalizedCategoryKey })
      .select("userId")
      .lean()
    const candidateUserIds = gymkhanaProfiles
      .map((profile) => normalizeObjectId(profile.userId))
      .filter(Boolean)

    if (candidateUserIds.length === 0) return []

    const gsUsers = await User.find({
      _id: { $in: candidateUserIds },
      role: ROLES.GYMKHANA,
      subRole: SUBROLES.GS_GYMKHANA,
    })
      .select("_id")
      .lean()

    return gsUsers.map((user) => normalizeObjectId(user._id)).filter(Boolean)
  }

  async buildClubLinkedPorCategoryDefinition(club, categoriesByKey = null, presidentUserIds = null) {
    const lookup = categoriesByKey || (await buildCategoryLookup()).categoriesByKey
    const categoryKey = normalizeCategoryKey(club?.gymkhanaCategoryKey)
    const gsUserIds = await this.resolveGsGymkhanaReviewerUserIds(categoryKey)
    const presidents =
      Array.isArray(presidentUserIds) && presidentUserIds.length > 0
        ? presidentUserIds
        : (
            await User.find({
              role: ROLES.GYMKHANA,
              subRole: SUBROLES.PRESIDENT_GYMKHANA,
            })
              .select("_id")
              .lean()
          )
            .map((user) => normalizeObjectId(user._id))
            .filter(Boolean)

    const stepDefinitions = []
    const clubUserId = normalizeObjectId(club?.userId)
    if (clubUserId) {
      stepDefinitions.push({
        label: "Club Review",
        reviewerUserIds: [clubUserId],
      })
    }

    if (gsUserIds.length > 0) {
      stepDefinitions.push({
        label: `${lookup?.get(categoryKey) || categoryKey || "GS"} Review`,
        reviewerUserIds: gsUserIds,
      })
    }

    if (presidents.length > 0) {
      stepDefinitions.push({
        label: "President Gymkhana",
        reviewerUserIds: presidents,
      })
    }

    return {
      name: normalizeText(club?.name) || "POR Category",
      legacyGymkhanaCategoryKey: categoryKey,
      gymkhanaSteps: cloneGymkhanaSteps(stepDefinitions),
    }
  }

  async syncClubLinkedPorCategories({ categoriesByKey = null, updateExisting = false } = {}) {
    const clubs = await Club.find().select("_id name userId gymkhanaCategoryKey email").lean()
    if (!clubs.length) {
      return { created: 0, updated: 0, skipped: 0 }
    }

    const presidents = await User.find({
      role: ROLES.GYMKHANA,
      subRole: SUBROLES.PRESIDENT_GYMKHANA,
    })
      .select("_id")
      .lean()
    const presidentUserIds = presidents.map((user) => normalizeObjectId(user._id)).filter(Boolean)

    let created = 0
    let updated = 0
    let skipped = 0

    for (const club of clubs) {
      const legacyClubId = normalizeObjectId(club._id)
      if (!legacyClubId) {
        skipped += 1
        continue
      }

      const definition = await this.buildClubLinkedPorCategoryDefinition(
        club,
        categoriesByKey,
        presidentUserIds
      )

      if (definition.gymkhanaSteps.length === 0) {
        skipped += 1
        continue
      }

      const existing = await PorCategory.findOne({ legacyClubId })
      if (!existing) {
        await PorCategory.create({
          name: definition.name,
          gymkhanaSteps: definition.gymkhanaSteps,
          legacyClubId,
          legacyGymkhanaCategoryKey: definition.legacyGymkhanaCategoryKey,
          isLegacyMigrated: true,
        })
        created += 1
        continue
      }

      if (!updateExisting) {
        skipped += 1
        continue
      }

      existing.name = definition.name
      existing.gymkhanaSteps = definition.gymkhanaSteps
      existing.legacyGymkhanaCategoryKey = definition.legacyGymkhanaCategoryKey
      existing.isLegacyMigrated = true
      await existing.save()
      updated += 1
    }

    return { created, updated, skipped }
  }

  async ensureLegacyPorCategories(categoriesByKey = null) {
    await this.syncClubLinkedPorCategories({ categoriesByKey, updateExisting: false })
  }

  async syncRequestWithPorCategoryDefinition(porRequest, porCategory) {
    if (!porRequest || !porCategory) return porRequest

    const categoryId = normalizeObjectId(porCategory._id)
    const gymkhanaSteps = cloneGymkhanaSteps(porCategory.gymkhanaSteps)
    porRequest.porCategoryId = categoryId
    porRequest.porCategoryNameSnapshot = normalizeText(porCategory.name)
    porRequest.gymkhanaCategoryKey = normalizeCategoryKey(porCategory.legacyGymkhanaCategoryKey)
    porRequest.gymkhanaApprovalSteps = gymkhanaSteps

    if (porRequest.status === POR_STATUS.PENDING_GYMKHANA) {
      const currentIndex = resolveGymkhanaStepIndex(porRequest, gymkhanaSteps)
      const currentStep = findNextGymkhanaStep(gymkhanaSteps, currentIndex)
      if (currentStep) {
        porRequest.currentGymkhanaStepIndex = currentStep.index
        porRequest.currentApprovalStage = currentStep.step.label
        porRequest.currentApproverUsers = currentStep.step.reviewerUserIds
        porRequest.currentApproverUser = getFirstReviewerId(currentStep.step.reviewerUserIds)
      }
    } else if (porRequest.status === POR_STATUS.PENDING_STUDENT_AFFAIRS) {
      porRequest.currentApprovalStage = POR_APPROVAL_STAGES.STUDENT_AFFAIRS
      porRequest.currentApproverUsers = []
      porRequest.currentApproverUser = null
      porRequest.currentGymkhanaStepIndex = gymkhanaSteps.length > 0 ? gymkhanaSteps.length - 1 : null
    } else if (isPostStudentAffairsStage(porRequest.currentApprovalStage)) {
      porRequest.currentApproverUsers = normalizeObjectId(porRequest.currentApproverUser)
        ? [normalizeObjectId(porRequest.currentApproverUser)]
        : []
      porRequest.currentGymkhanaStepIndex = gymkhanaSteps.length > 0 ? gymkhanaSteps.length - 1 : null
    }

    await porRequest.save()
    return porRequest
  }

  async migrateLegacyRequestIfNeeded(porRequest, categoriesByKey = null) {
    if (!porRequest) return porRequest

    const needsSnapshot =
      !normalizeObjectId(porRequest.porCategoryId) ||
      !Array.isArray(porRequest.gymkhanaApprovalSteps) ||
      porRequest.gymkhanaApprovalSteps.length === 0
    const isLegacyGymkhanaStatus = [
      POR_STATUS.PENDING_CLUB,
      POR_STATUS.PENDING_GS,
      POR_STATUS.PENDING_PRESIDENT,
    ].includes(porRequest.status)

    if (!needsSnapshot && !isLegacyGymkhanaStatus) {
      return porRequest
    }

    const clubId = normalizeObjectId(
      typeof porRequest.clubId === "object" ? porRequest.clubId?._id : porRequest.clubId
    )
    if (!clubId) return porRequest

    await this.ensureLegacyPorCategories(categoriesByKey)

    const category = await PorCategory.findOne({ legacyClubId: clubId }).select(
      "_id name gymkhanaSteps legacyGymkhanaCategoryKey"
    )
    if (!category) return porRequest

    porRequest.porCategoryId = category._id
    if (!normalizeText(porRequest.porCategoryNameSnapshot)) {
      porRequest.porCategoryNameSnapshot = normalizeText(category.name)
    }

    if (!normalizeText(porRequest.gymkhanaCategoryKey)) {
      porRequest.gymkhanaCategoryKey = normalizeCategoryKey(category.legacyGymkhanaCategoryKey)
    }

    const gymkhanaApprovalSteps = cloneGymkhanaSteps(category.gymkhanaSteps)
    porRequest.gymkhanaApprovalSteps = gymkhanaApprovalSteps

    if (isLegacyGymkhanaStatus) {
      const legacyIndexByStatus = {
        [POR_STATUS.PENDING_CLUB]: 0,
        [POR_STATUS.PENDING_GS]: 1,
        [POR_STATUS.PENDING_PRESIDENT]: 2,
      }

      const desiredIndex = legacyIndexByStatus[porRequest.status] ?? 0
      const nextStep = findNextGymkhanaStep(gymkhanaApprovalSteps, desiredIndex)

      if (nextStep) {
        porRequest.status = POR_STATUS.PENDING_GYMKHANA
        porRequest.currentGymkhanaStepIndex = nextStep.index
        porRequest.currentApprovalStage = nextStep.step.label
        porRequest.currentApproverUsers = nextStep.step.reviewerUserIds
        porRequest.currentApproverUser = getFirstReviewerId(nextStep.step.reviewerUserIds)
      } else {
        porRequest.status = POR_STATUS.PENDING_STUDENT_AFFAIRS
        porRequest.currentGymkhanaStepIndex = gymkhanaApprovalSteps.length - 1
        porRequest.currentApprovalStage = POR_APPROVAL_STAGES.STUDENT_AFFAIRS
        porRequest.currentApproverUser = null
        porRequest.currentApproverUsers = []
      }
    } else if (porRequest.status === POR_STATUS.PENDING_STUDENT_AFFAIRS) {
      porRequest.currentApprovalStage = POR_APPROVAL_STAGES.STUDENT_AFFAIRS
      porRequest.currentApproverUser = null
      porRequest.currentApproverUsers = []
      porRequest.currentGymkhanaStepIndex = gymkhanaApprovalSteps.length > 0 ? gymkhanaApprovalSteps.length - 1 : null
    } else if (isPostStudentAffairsStage(porRequest.currentApprovalStage)) {
      porRequest.currentApproverUsers = normalizeObjectId(porRequest.currentApproverUser)
        ? [normalizeObjectId(porRequest.currentApproverUser)]
        : []
    }

    await porRequest.save()
    return porRequest
  }

  async getAccessibleRequests(user, viewerContext, categoriesByKey) {
    const query = this.buildAccessQuery(user, viewerContext)
    const requests = await this.model.find(query).sort({ updatedAt: -1 })

    for (const request of requests) {
      await this.migrateLegacyRequestIfNeeded(request, categoriesByKey)
    }

    await this.model.populate(requests, [
      { path: "submittedBy", select: "name email" },
      { path: "rejectedBy", select: "name email subRole" },
      { path: "currentApproverUser", select: "name email subRole" },
      { path: "currentApproverUsers", select: "name email subRole" },
      { path: "clubId", select: "name email gymkhanaCategoryKey userId" },
      { path: "porCategoryId", select: "name" },
    ])

    return requests
  }

  buildAccessQuery(user, viewerContext) {
    if (viewerContext.mode === "student") {
      return { submittedBy: user._id }
    }

    if (viewerContext.mode === "club") {
      return {
        $or: [
          viewerContext.clubId ? { clubId: viewerContext.clubId } : null,
          { "gymkhanaApprovalSteps.reviewerUserIds": user._id },
          { currentApproverUsers: user._id },
          { currentApproverUser: user._id },
        ].filter(Boolean),
      }
    }

    if (viewerContext.mode === "gs") {
      return {
        $or: [
          {
            gymkhanaCategoryKey: {
              $in: Array.isArray(viewerContext.categoryKeys) ? viewerContext.categoryKeys : [],
            },
          },
          { "gymkhanaApprovalSteps.reviewerUserIds": user._id },
          { currentApproverUsers: user._id },
          { currentApproverUser: user._id },
        ],
      }
    }

    if (viewerContext.mode === "gymkhana") {
      return {
        $or: [
          { "gymkhanaApprovalSteps.reviewerUserIds": user._id },
          { currentApproverUsers: user._id },
          { currentApproverUser: user._id },
        ],
      }
    }

    if (
      ["president", "student_affairs", "post_student_affairs"].includes(viewerContext.mode)
    ) {
      return {}
    }

    return { _id: null }
  }

  canAccessRequest(porRequest, user, viewerContext) {
    if (!porRequest || !viewerContext?.supported) return false

    if (viewerContext.mode === "student") {
      return normalizeObjectId(porRequest.submittedBy) === normalizeObjectId(user._id)
    }

    if (isGymkhanaViewerMode(viewerContext.mode)) {
      const userId = normalizeObjectId(user._id)
      if (getCurrentApproverUserIds(porRequest).includes(userId)) {
        return true
      }

      const isExplicitReviewer = (Array.isArray(porRequest.gymkhanaApprovalSteps)
        ? porRequest.gymkhanaApprovalSteps
        : []
      ).some((step) => normalizeUserIdList(step?.reviewerUserIds).includes(userId))
      if (isExplicitReviewer) {
        return true
      }

      if (viewerContext.mode === "club") {
        return normalizeObjectId(porRequest.clubId?._id || porRequest.clubId) === viewerContext.clubId
      }

      if (viewerContext.mode === "gs") {
        const categoryKey = normalizeCategoryKey(porRequest.gymkhanaCategoryKey)
        return (
          categoryKey &&
          Array.isArray(viewerContext.categoryKeys) &&
          viewerContext.categoryKeys.includes(categoryKey)
        )
      }

      return viewerContext.mode === "president" || viewerContext.mode === "gymkhana"
    }

    return ["student_affairs", "post_student_affairs"].includes(viewerContext.mode)
  }

  getActionAccess(porRequest, user, viewerContext) {
    if (!porRequest) {
      return { canAct: false, message: "POR request not found", stage: null }
    }

    if (!this.canAccessRequest(porRequest, user, viewerContext)) {
      return { canAct: false, message: "You cannot access this POR request", stage: null }
    }

    if (porRequest.status === POR_STATUS.PENDING_GYMKHANA) {
      const approverUserIds = getCurrentApproverUserIds(porRequest)
      const canAct = approverUserIds.includes(normalizeObjectId(user._id))
      return {
        canAct,
        message: canAct ? "" : "Only the assigned Gymkhana reviewers can act on this POR request",
        stage: porRequest.currentApprovalStage || POR_APPROVAL_STAGES.GYMKHANA,
      }
    }

    if (porRequest.status === POR_STATUS.PENDING_STUDENT_AFFAIRS) {
      const canAct = viewerContext.mode === "student_affairs"
      return {
        canAct,
        message: canAct ? "" : "Only Office - Student Affairs can review this POR request",
        stage: POR_APPROVAL_STAGES.STUDENT_AFFAIRS,
      }
    }

    if (
      [
        POR_STATUS.PENDING_OFFICER,
        POR_STATUS.PENDING_ASSOCIATE_DEAN,
        POR_STATUS.PENDING_DEAN,
      ].includes(porRequest.status)
    ) {
      const requiredStage = porRequest.currentApprovalStage
      const assignedApproverUserId = normalizeObjectId(porRequest.currentApproverUser)
      const canAct =
        Boolean(requiredStage) &&
        user?.subRole === requiredStage &&
        (!assignedApproverUserId || assignedApproverUserId === normalizeObjectId(user._id))

      return {
        canAct,
        message: canAct ? "" : `Only ${requiredStage || "the assigned reviewer"} can review this POR request`,
        stage: requiredStage,
      }
    }

    return {
      canAct: false,
      message: "POR request is not pending approval",
      stage: porRequest.currentApprovalStage || null,
    }
  }

  async getSerializedRequestById(requestId, user, viewerContext) {
    const request = await this.model
      .findById(requestId)
      .populate("submittedBy", "name email")
      .populate("rejectedBy", "name email subRole")
      .populate("currentApproverUser", "name email subRole")
      .populate("currentApproverUsers", "name email subRole")
      .populate("clubId", "name email gymkhanaCategoryKey userId")
      .populate("porCategoryId", "name")

    if (!request) return null

    const { categoriesByKey } = await buildCategoryLookup()
    const serialized = await this.serializeRequests([request], user, viewerContext, categoriesByKey)
    return serialized[0] || null
  }

  async serializeRequests(requests, user, viewerContext, categoriesByKey) {
    const safeRequests = Array.isArray(requests) ? requests.filter(Boolean) : []
    const submittedUserIds = [
      ...new Set(
        safeRequests
          .map((request) => normalizeObjectId(request?.submittedBy?._id || request?.submittedBy))
          .filter(Boolean)
      ),
    ]

    const studentProfiles = await StudentProfile.find({
      userId: { $in: submittedUserIds },
    })
      .select("userId rollNumber department degree batch")
      .lean()

    const studentProfileByUserId = new Map(
      studentProfiles.map((profile) => [normalizeObjectId(profile.userId), profile])
    )

    return safeRequests.map((request) => {
      const submittedBy =
        typeof request.submittedBy === "object" && request.submittedBy
          ? request.submittedBy
          : null
      const club =
        typeof request.clubId === "object" && request.clubId
          ? request.clubId
          : null
      const porCategory =
        typeof request.porCategoryId === "object" && request.porCategoryId
          ? request.porCategoryId
          : null
      const currentApproverUser =
        typeof request.currentApproverUser === "object" && request.currentApproverUser
          ? request.currentApproverUser
          : null
      const currentApproverUsers = Array.isArray(request.currentApproverUsers)
        ? request.currentApproverUsers
            .filter((userEntry) => typeof userEntry === "object" && userEntry)
            .map((userEntry) => ({
              id: normalizeObjectId(userEntry._id),
              name: normalizeText(userEntry.name),
              email: normalizeText(userEntry.email).toLowerCase(),
              subRole: normalizeText(userEntry.subRole),
            }))
        : []
      const rejectedBy =
        typeof request.rejectedBy === "object" && request.rejectedBy
          ? request.rejectedBy
          : null
      const submittedByUserId = normalizeObjectId(submittedBy?._id || request.submittedBy)
      const studentProfile = studentProfileByUserId.get(submittedByUserId)
      const actionAccess = this.getActionAccess(request, user, viewerContext)
      const canEdit =
        viewerContext.mode === "student" &&
        submittedByUserId === normalizeObjectId(user._id) &&
        request.status === POR_STATUS.REVISION_REQUESTED

      const porCategoryName =
        normalizeText(request.porCategoryNameSnapshot) ||
        normalizeText(porCategory?.name) ||
        normalizeText(club?.name)

      return {
        id: normalizeObjectId(request._id),
        student: {
          userId: submittedByUserId,
          name: normalizeText(submittedBy?.name),
          email: normalizeText(submittedBy?.email).toLowerCase(),
          rollNumber: normalizeText(studentProfile?.rollNumber),
          department: normalizeText(studentProfile?.department),
          degree: normalizeText(studentProfile?.degree),
          batch: normalizeText(studentProfile?.batch),
        },
        club: {
          id: normalizeObjectId(club?._id || request.clubId),
          name: normalizeText(club?.name),
          email: normalizeText(club?.email).toLowerCase(),
          userId: normalizeObjectId(club?.userId),
        },
        porCategory: {
          id: normalizeObjectId(porCategory?._id || request.porCategoryId),
          name: porCategoryName,
        },
        porCategoryName,
        gymkhanaCategoryKey: normalizeCategoryKey(request.gymkhanaCategoryKey),
        gymkhanaCategoryLabel:
          categoriesByKey.get(normalizeCategoryKey(request.gymkhanaCategoryKey)) ||
          normalizeCategoryKey(request.gymkhanaCategoryKey),
        hasDisciplinaryAction: Boolean(request.hasDisciplinaryAction),
        disciplinaryActionDetails: normalizeOptionalText(request.disciplinaryActionDetails),
        positionTitle: normalizeText(request.positionTitle),
        positionDetails: normalizeText(request.positionDetails),
        tenure: normalizeText(request.tenure),
        supportingDocumentUrl: normalizeOptionalText(request.supportingDocumentUrl),
        supportingDocumentName: normalizeOptionalText(request.supportingDocumentName),
        undertakingAccepted: Boolean(request.undertakingAccepted),
        status: request.status,
        currentApprovalStage: request.currentApprovalStage || null,
        currentApproverUser: currentApproverUser
          ? {
              id: normalizeObjectId(currentApproverUser._id),
              name: normalizeText(currentApproverUser.name),
              email: normalizeText(currentApproverUser.email).toLowerCase(),
              subRole: currentApproverUser.subRole || "",
            }
          : null,
        currentApproverUsers,
        rejectionReason: request.rejectionReason || "",
        rejectedBy: rejectedBy
          ? {
              id: normalizeObjectId(rejectedBy._id),
              name: normalizeText(rejectedBy.name),
              email: normalizeText(rejectedBy.email).toLowerCase(),
              subRole: rejectedBy.subRole || "",
            }
          : null,
        rejectedAt: request.rejectedAt || null,
        approvedAt: request.approvedAt || null,
        revisionCount: Number(request.revisionCount || 0),
        createdAt: request.createdAt || null,
        updatedAt: request.updatedAt || null,
        permissions: {
          canEdit,
          canApprove: actionAccess.canAct,
          canReject: actionAccess.canAct,
          canRequestRevision: actionAccess.canAct,
        },
        isActionRequired: actionAccess.canAct || canEdit,
      }
    })
  }

  buildStats(serializedRequests, viewerContext) {
    if (!viewerContext?.viewer?.showStats) {
      return []
    }

    const total = Array.isArray(serializedRequests) ? serializedRequests.length : 0
    const counts = new Map()
    for (const request of serializedRequests || []) {
      const categoryName = normalizeText(request?.porCategoryName)
      if (!categoryName) continue
      counts.set(categoryName, (counts.get(categoryName) || 0) + 1)
    }

    const stats = [
      {
        title: "Total Requests",
        value: total,
        subtitle: "Accessible in your workspace",
      },
    ]

    const sortedNames = [...counts.keys()].sort((left, right) => left.localeCompare(right))
    for (const name of sortedNames) {
      stats.push({
        title: name,
        value: counts.get(name) || 0,
        subtitle: "POR category requests",
      })
    }

    return stats
  }
}

export const porService = new PorService()

export default porService
