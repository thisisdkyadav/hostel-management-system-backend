import { BaseService } from "../../../../services/base/BaseService.js"
import {
  badRequest,
  created,
  forbidden,
  notFound,
  success,
} from "../../../../services/base/ServiceResponse.js"
import PorRequest from "../../../../models/club/PorRequest.model.js"
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
  POR_STATUS_TO_APPROVER,
} from "./por.constants.js"

const normalizeText = (value = "") => String(value || "").trim()

const normalizeOptionalText = (value = "") => {
  const normalized = normalizeText(value)
  return normalized || ""
}

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

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

const sortClubsByName = (clubs = []) =>
  [...clubs].sort((left, right) => {
    const leftName = normalizeText(left?.name).toLowerCase()
    const rightName = normalizeText(right?.name).toLowerCase()
    return leftName.localeCompare(rightName)
  })

const resolveViewerMode = (user) => {
  if (!user) return "unknown"
  if (user.role === ROLES.STUDENT) return "student"

  if (user.role === ROLES.GYMKHANA) {
    if (user.subRole === SUBROLES.CLUB) return "club"
    if (user.subRole === SUBROLES.GS_GYMKHANA) return "gs"
    if (user.subRole === SUBROLES.PRESIDENT_GYMKHANA) return "president"
    return "gymkhana_other"
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

class PorService extends BaseService {
  constructor() {
    super(PorRequest, "PorRequest")
  }

  async getWorkspace(user) {
    const viewerContext = await this.getViewerContext(user)
    if (!viewerContext.supported) {
      return success({
        viewer: viewerContext.viewer,
        clubs: [],
        requests: [],
        stats: [],
        approversByStage: {},
      })
    }

    const [categoryLookup, clubs, requests, approversByStage] = await Promise.all([
      buildCategoryLookup(),
      this.getClubsForSelection(),
      this.getAccessibleRequests(user, viewerContext),
      viewerContext.viewer.canSelectPostApprovers
        ? getPostStudentAffairsApproverOptionsByStage()
        : Promise.resolve({}),
    ])

    const serializedRequests = await this.serializeRequests(requests, user, viewerContext, categoryLookup.categoriesByKey)
    const stats = this.buildStats(serializedRequests, viewerContext, categoryLookup.categoriesByKey)

    return success(
      {
        viewer: viewerContext.viewer,
        clubs: viewerContext.viewer.canCreate ? clubs : [],
        requests: serializedRequests,
        stats,
        approversByStage,
      },
      200,
      "POR workspace loaded successfully"
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

    const club = await Club.findById(data.clubId).select("_id name userId gymkhanaCategoryKey email")
    if (!club) {
      return notFound("Club")
    }

    const porRequest = await this.model.create({
      submittedBy: user._id,
      clubId: club._id,
      gymkhanaCategoryKey: normalizeCategoryKey(club.gymkhanaCategoryKey),
      hasDisciplinaryAction: Boolean(data.hasDisciplinaryAction),
      disciplinaryActionDetails: data.hasDisciplinaryAction
        ? normalizeOptionalText(data.disciplinaryActionDetails)
        : "",
      positionTitle: normalizeText(data.positionTitle),
      positionDetails: normalizeText(data.positionDetails),
      tenure: normalizeText(data.tenure),
      status: POR_STATUS.PENDING_CLUB,
      currentApprovalStage: POR_APPROVAL_STAGES.CLUB,
      currentApproverUser: club.userId,
      customApprovalChain: [],
      currentChainIndex: null,
      customApprovalAssignments: [],
    })

    await ApprovalLog.create({
      entityType: "PorRequest",
      entityId: porRequest._id,
      stage: POR_APPROVAL_STAGES.STUDENT,
      action: POR_APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
      comments: studentProfile.rollNumber
        ? `Submitted by ${studentProfile.rollNumber}`
        : "",
    })

    await this.notifyNextPorReviewers({
      porRequestId: porRequest._id,
      movedByUser: user,
      movedFromStage: POR_APPROVAL_STAGES.STUDENT,
      comments: studentProfile.rollNumber
        ? `Submitted by ${studentProfile.rollNumber}`
        : "",
      trigger: "submitted",
    })

    const { categoriesByKey } = await buildCategoryLookup()
    const serializedRequests = await this.serializeRequests(
      [
        await this.model
          .findById(porRequest._id)
          .populate("submittedBy", "name email")
          .populate("rejectedBy", "name email subRole")
          .populate("currentApproverUser", "name email subRole")
          .populate("clubId", "name email gymkhanaCategoryKey userId"),
      ],
      user,
      await this.getViewerContext(user),
      categoriesByKey
    )

    return created(
      {
        request: serializedRequests[0] || null,
      },
      "POR request submitted successfully"
    )
  }

  async updatePorRequest(id, data, user) {
    const porRequest = await this.model.findById(id)
    if (!porRequest) {
      return notFound("POR request")
    }

    if (normalizeObjectId(porRequest.submittedBy) !== normalizeObjectId(user._id)) {
      return forbidden("You can only update your own POR request")
    }

    if (porRequest.status !== POR_STATUS.REVISION_REQUESTED) {
      return badRequest("Only POR requests needing modification can be updated")
    }

    const club = await Club.findById(data.clubId).select("_id userId gymkhanaCategoryKey")
    if (!club) {
      return notFound("Club")
    }

    porRequest.clubId = club._id
    porRequest.gymkhanaCategoryKey = normalizeCategoryKey(club.gymkhanaCategoryKey)
    porRequest.hasDisciplinaryAction = Boolean(data.hasDisciplinaryAction)
    porRequest.disciplinaryActionDetails = data.hasDisciplinaryAction
      ? normalizeOptionalText(data.disciplinaryActionDetails)
      : ""
    porRequest.positionTitle = normalizeText(data.positionTitle)
    porRequest.positionDetails = normalizeText(data.positionDetails)
    porRequest.tenure = normalizeText(data.tenure)
    porRequest.status = POR_STATUS.PENDING_CLUB
    porRequest.currentApprovalStage = POR_APPROVAL_STAGES.CLUB
    porRequest.currentApproverUser = club.userId
    porRequest.customApprovalChain = []
    porRequest.currentChainIndex = null
    clearCustomApprovalAssignments(porRequest)
    porRequest.revisionCount += 1
    porRequest.rejectionReason = null
    porRequest.rejectedBy = null
    porRequest.rejectedAt = null
    porRequest.approvedAt = null
    await porRequest.save()

    await ApprovalLog.create({
      entityType: "PorRequest",
      entityId: porRequest._id,
      stage: POR_APPROVAL_STAGES.STUDENT,
      action: POR_APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
      comments: `Revision #${porRequest.revisionCount}`,
    })

    await this.notifyNextPorReviewers({
      porRequestId: porRequest._id,
      movedByUser: user,
      movedFromStage: POR_APPROVAL_STAGES.STUDENT,
      comments: `Revision #${porRequest.revisionCount}`,
      trigger: "submitted",
    })

    const { categoriesByKey } = await buildCategoryLookup()
    const serializedRequests = await this.serializeRequests(
      [
        await this.model
          .findById(porRequest._id)
          .populate("submittedBy", "name email")
          .populate("rejectedBy", "name email subRole")
          .populate("currentApproverUser", "name email subRole")
          .populate("clubId", "name email gymkhanaCategoryKey userId"),
      ],
      user,
      await this.getViewerContext(user),
      categoriesByKey
    )

    return success(
      {
        request: serializedRequests[0] || null,
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
      .populate("clubId", "name email gymkhanaCategoryKey userId")
      .lean()

    if (!request) return null

    const { categoriesByKey } = await buildCategoryLookup()
    const categoryKey = normalizeCategoryKey(request.gymkhanaCategoryKey)

    return {
      request,
      student: request.submittedBy || null,
      club: request.clubId || null,
      categoryLabel: categoriesByKey.get(categoryKey) || categoryKey,
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

    if (nextStage === POR_APPROVAL_STAGES.CLUB) {
      const clubUserId = context?.club?.userId
      if (!clubUserId) return []
      return User.find({ _id: clubUserId }).select("name email role subRole").lean()
    }

    if (nextStage === POR_APPROVAL_STAGES.GS_GYMKHANA) {
      const categoryKey = normalizeCategoryKey(request.gymkhanaCategoryKey)
      if (!categoryKey) return []

      const gymkhanaProfiles = await Gymkhana.find({ categories: categoryKey }).select("userId").lean()
      const userIds = gymkhanaProfiles.map((profile) => profile.userId).filter(Boolean)
      if (userIds.length === 0) return []

      return User.find({
        _id: { $in: userIds },
        role: ROLES.GYMKHANA,
        subRole: SUBROLES.GS_GYMKHANA,
      })
        .select("name email role subRole")
        .lean()
    }

    if (nextStage === POR_APPROVAL_STAGES.PRESIDENT_GYMKHANA) {
      return User.find({
        role: ROLES.GYMKHANA,
        subRole: SUBROLES.PRESIDENT_GYMKHANA,
      })
        .select("name email role subRole")
        .lean()
    }

    if (nextStage === POR_APPROVAL_STAGES.STUDENT_AFFAIRS) {
      return User.find({
        role: ROLES.ADMIN,
        subRole: SUBROLES.STUDENT_AFFAIRS,
      })
        .select("name email role subRole")
        .lean()
    }

    if (
      [
        POR_APPROVAL_STAGES.OFFICER_SA,
        POR_APPROVAL_STAGES.ASSOCIATE_DEAN_SA,
        POR_APPROVAL_STAGES.DEAN_SA,
      ].includes(nextStage)
    ) {
      if (request.currentApproverUser?.email) {
        return [request.currentApproverUser]
      }

      if (!request.currentApproverUser?._id) return []
      return User.find({ _id: request.currentApproverUser._id }).select("name email role subRole").lean()
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

      const commentsBlock = safeComments
        ? `<p><strong>Comments:</strong><br />${escapeHtml(safeComments)}</p>`
        : ""

      const body = `
        <p>Dear Reviewer,</p>
        <p>A POR verification request has been ${escapeHtml(actionText)} and is now pending at your stage.</p>
        <div class="info-box">
          <p><strong>Request:</strong> ${escapeHtml(requestTitle)}</p>
          <p><strong>Student:</strong> ${escapeHtml(context.student?.name || "Student")} (${escapeHtml(context.student?.email || "No email")})</p>
          <p><strong>Club:</strong> ${escapeHtml(context.club?.name || "Club")}</p>
          <p><strong>GS Category:</strong> ${escapeHtml(context.categoryLabel || "Category")}</p>
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

      const body = `
        <p>Hello ${escapeHtml(context.student?.name || "Student")},</p>
        <p>${escapeHtml(actionMeta.description)}</p>
        <div class="${actionMeta.boxClass}">
          <p><strong>Request:</strong> ${escapeHtml(requestTitle)}</p>
          <p><strong>Club:</strong> ${escapeHtml(context.club?.name || "Club")}</p>
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

  async approvePorRequest(id, comments, user, nextApprovalStages = [], nextApprovers = []) {
    const porRequest = await this.model.findById(id)
    if (!porRequest) {
      return notFound("POR request")
    }

    const viewerContext = await this.getViewerContext(user)
    const actionAccess = this.getActionAccess(porRequest, user, viewerContext)
    if (!actionAccess.canAct) {
      return forbidden(actionAccess.message || "You cannot approve this POR request")
    }

    const currentStage = actionAccess.stage
    const normalizedComments = normalizeOptionalText(comments)

    if (currentStage === POR_APPROVAL_STAGES.STUDENT_AFFAIRS) {
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
    } else if (
      [
        POR_APPROVAL_STAGES.OFFICER_SA,
        POR_APPROVAL_STAGES.ASSOCIATE_DEAN_SA,
        POR_APPROVAL_STAGES.DEAN_SA,
      ].includes(currentStage)
    ) {
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
      } else {
        porRequest.status = POR_APPROVER_TO_STATUS[nextAssignment.stage]
        porRequest.currentApprovalStage = nextAssignment.stage
        porRequest.currentChainIndex = assignmentState.currentIndex + 1
        porRequest.currentApproverUser = normalizeObjectId(nextAssignment.userId)
      }
    } else if (currentStage === POR_APPROVAL_STAGES.CLUB) {
      porRequest.status = POR_STATUS.PENDING_GS
      porRequest.currentApprovalStage = POR_APPROVAL_STAGES.GS_GYMKHANA
      porRequest.currentApproverUser = null
    } else if (currentStage === POR_APPROVAL_STAGES.GS_GYMKHANA) {
      porRequest.status = POR_STATUS.PENDING_PRESIDENT
      porRequest.currentApprovalStage = POR_APPROVAL_STAGES.PRESIDENT_GYMKHANA
      porRequest.currentApproverUser = null
    } else if (currentStage === POR_APPROVAL_STAGES.PRESIDENT_GYMKHANA) {
      porRequest.status = POR_STATUS.PENDING_STUDENT_AFFAIRS
      porRequest.currentApprovalStage = POR_APPROVAL_STAGES.STUDENT_AFFAIRS
      porRequest.currentApproverUser = null
      porRequest.customApprovalChain = []
      porRequest.currentChainIndex = null
      clearCustomApprovalAssignments(porRequest)
    } else {
      return badRequest("POR request is not at an approvable stage")
    }

    if (porRequest.status === POR_STATUS.APPROVED) {
      porRequest.approvedAt = new Date()
      porRequest.currentApprovalStage = null
      porRequest.currentChainIndex = null
      porRequest.currentApproverUser = null
    }

    await porRequest.save()

    await ApprovalLog.create({
      entityType: "PorRequest",
      entityId: porRequest._id,
      stage: currentStage,
      action: POR_APPROVAL_ACTIONS.APPROVED,
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

    return success({ request: porRequest }, 200, "POR request approved")
  }

  async rejectPorRequest(id, reason, user) {
    const porRequest = await this.model.findById(id)
    if (!porRequest) {
      return notFound("POR request")
    }

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
    porRequest.customApprovalChain = []
    porRequest.currentChainIndex = null
    porRequest.currentApproverUser = null
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
    porRequest.customApprovalChain = []
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
    }

    if (mode === "student") {
      return { supported: true, viewer, mode }
    }

    if (mode === "club") {
      const club = await Club.findOne({ userId: user._id }).select("_id userId gymkhanaCategoryKey name").lean()
      if (!club) {
        return { supported: false, viewer, mode }
      }
      return {
        supported: true,
        viewer,
        mode,
        clubId: normalizeObjectId(club._id),
        clubUserId: normalizeObjectId(club.userId),
      }
    }

    if (mode === "gs") {
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

  async getClubsForSelection() {
    const clubs = await Club.find()
      .select("_id name email gymkhanaCategoryKey userId")
      .lean()

    return sortClubsByName(clubs).map((club) => ({
      id: normalizeObjectId(club._id),
      name: normalizeText(club.name),
      email: normalizeText(club.email).toLowerCase(),
      gymkhanaCategoryKey: normalizeCategoryKey(club.gymkhanaCategoryKey),
      userId: normalizeObjectId(club.userId),
    }))
  }

  async getAccessibleRequests(user, viewerContext) {
    const query = this.buildAccessQuery(user, viewerContext)
    return this.model
      .find(query)
      .populate("submittedBy", "name email")
      .populate("rejectedBy", "name email subRole")
      .populate("currentApproverUser", "name email subRole")
      .populate("clubId", "name email gymkhanaCategoryKey userId")
      .sort({ updatedAt: -1 })
      .lean()
  }

  buildAccessQuery(user, viewerContext) {
    if (viewerContext.mode === "student") {
      return { submittedBy: user._id }
    }

    if (viewerContext.mode === "club") {
      return { clubId: viewerContext.clubId }
    }

    if (viewerContext.mode === "gs") {
      return {
        gymkhanaCategoryKey: {
          $in: Array.isArray(viewerContext.categoryKeys) ? viewerContext.categoryKeys : [],
        },
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

    return ["president", "student_affairs", "post_student_affairs"].includes(viewerContext.mode)
  }

  getActionAccess(porRequest, user, viewerContext) {
    if (!porRequest) {
      return { canAct: false, message: "POR request not found", stage: null }
    }

    const requiredStage = POR_STATUS_TO_APPROVER[porRequest.status]
    if (!requiredStage) {
      return { canAct: false, message: "POR request is not pending approval", stage: null }
    }

    if (!this.canAccessRequest(porRequest, user, viewerContext)) {
      return { canAct: false, message: "You cannot access this POR request", stage: requiredStage }
    }

    const assignedApproverUserId = normalizeObjectId(porRequest.currentApproverUser)
    if (assignedApproverUserId && assignedApproverUserId !== normalizeObjectId(user._id)) {
      return {
        canAct: false,
        message: "Only the assigned approver can act on this POR request",
        stage: requiredStage,
      }
    }

    if (requiredStage === POR_APPROVAL_STAGES.CLUB) {
      const canAct =
        viewerContext.mode === "club" &&
        normalizeObjectId(porRequest.clubId?._id || porRequest.clubId) === viewerContext.clubId
      return {
        canAct,
        message: canAct ? "" : "Only the selected club can review this POR request",
        stage: requiredStage,
      }
    }

    if (requiredStage === POR_APPROVAL_STAGES.GS_GYMKHANA) {
      const categoryKey = normalizeCategoryKey(porRequest.gymkhanaCategoryKey)
      const canAct =
        viewerContext.mode === "gs" &&
        Array.isArray(viewerContext.categoryKeys) &&
        viewerContext.categoryKeys.includes(categoryKey)
      return {
        canAct,
        message: canAct
          ? ""
          : "Only a matching GS Gymkhana reviewer can act on this POR request",
        stage: requiredStage,
      }
    }

    if (requiredStage === POR_APPROVAL_STAGES.PRESIDENT_GYMKHANA) {
      const canAct = viewerContext.mode === "president"
      return {
        canAct,
        message: canAct ? "" : "Only President Gymkhana can review this POR request",
        stage: requiredStage,
      }
    }

    if (requiredStage === POR_APPROVAL_STAGES.STUDENT_AFFAIRS) {
      const canAct = viewerContext.mode === "student_affairs"
      return {
        canAct,
        message: canAct ? "" : "Only Office - Student Affairs can review this POR request",
        stage: requiredStage,
      }
    }

    if (
      [
        POR_APPROVAL_STAGES.OFFICER_SA,
        POR_APPROVAL_STAGES.ASSOCIATE_DEAN_SA,
        POR_APPROVAL_STAGES.DEAN_SA,
      ].includes(requiredStage)
    ) {
      const canAct = user?.subRole === requiredStage
      return {
        canAct,
        message: canAct ? "" : `Only ${requiredStage} can review this POR request`,
        stage: requiredStage,
      }
    }

    return {
      canAct: false,
      message: "You cannot act on this POR request",
      stage: requiredStage,
    }
  }

  async serializeRequests(requests, user, viewerContext, categoriesByKey) {
    const safeRequests = Array.isArray(requests) ? requests.filter(Boolean) : []
    const submittedUserIds = [
      ...new Set(
        safeRequests.map((request) => normalizeObjectId(request?.submittedBy?._id || request?.submittedBy)).filter(Boolean)
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
      const currentApproverUser =
        typeof request.currentApproverUser === "object" && request.currentApproverUser
          ? request.currentApproverUser
          : null
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
        gymkhanaCategoryKey: normalizeCategoryKey(request.gymkhanaCategoryKey),
        gymkhanaCategoryLabel:
          categoriesByKey.get(normalizeCategoryKey(request.gymkhanaCategoryKey)) ||
          normalizeCategoryKey(request.gymkhanaCategoryKey),
        hasDisciplinaryAction: Boolean(request.hasDisciplinaryAction),
        disciplinaryActionDetails: normalizeOptionalText(request.disciplinaryActionDetails),
        positionTitle: normalizeText(request.positionTitle),
        positionDetails: normalizeText(request.positionDetails),
        tenure: normalizeText(request.tenure),
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

  buildStats(serializedRequests, viewerContext, categoriesByKey) {
    if (!viewerContext?.viewer?.showStats) {
      return []
    }

    const total = Array.isArray(serializedRequests) ? serializedRequests.length : 0
    const counts = new Map()
    for (const request of serializedRequests || []) {
      const categoryKey = normalizeCategoryKey(request?.gymkhanaCategoryKey)
      if (!categoryKey) continue
      counts.set(categoryKey, (counts.get(categoryKey) || 0) + 1)
    }

    const stats = [
      {
        title: "Total Requests",
        value: total,
        subtitle: "Accessible in your workspace",
      },
    ]

    const sortedKeys = [...counts.keys()].sort((left, right) => {
      const leftLabel = categoriesByKey.get(left) || left
      const rightLabel = categoriesByKey.get(right) || right
      return leftLabel.localeCompare(rightLabel)
    })

    for (const key of sortedKeys) {
      stats.push({
        title: categoriesByKey.get(key) || key,
        value: counts.get(key) || 0,
        subtitle: "Category requests",
      })
    }

    return stats
  }
}

export const porService = new PorService()

export default porService
