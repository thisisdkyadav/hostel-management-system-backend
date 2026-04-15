/**
 * @fileoverview Approval assignment helpers
 * @description Utilities for assigning specific post-Student-Affairs approvers
 */

import User from "../../../../models/user/User.model.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import { POST_STUDENT_AFFAIRS_APPROVERS } from "./events.constants.js"

const normalizeStage = (value) => (typeof value === "string" ? value.trim() : "")

export const normalizeObjectId = (value) => {
  if (!value) return null
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "object" && value._id) {
    return String(value._id).trim() || null
  }
  return String(value).trim() || null
}

export const clearCustomApprovalAssignments = (entity) => {
  entity.customApprovalAssignments = []
  entity.currentApproverUser = null
}

export const resolvePostStudentAffairsAssignments = async (
  nextApprovers = [],
  nextApprovalStages = []
) => {
  const normalizedAssignments = Array.isArray(nextApprovers)
    ? nextApprovers
        .filter((assignment) => assignment && (assignment.stage || assignment.userId))
        .map((assignment) => ({
          stage: normalizeStage(assignment.stage),
          userId: normalizeObjectId(assignment.userId),
        }))
    : []

  if (normalizedAssignments.length === 0) {
    if (!Array.isArray(nextApprovalStages) || nextApprovalStages.length === 0) {
      return {
        success: false,
        message:
          "Student Affairs must select at least one next approver (Joint Registrar SA / Associate Dean SA / Dean SA)",
      }
    }

    const normalizedStages = nextApprovalStages.map((stage) => normalizeStage(stage))
    const uniqueStages = [...new Set(normalizedStages)]
    if (uniqueStages.length !== normalizedStages.length) {
      return {
        success: false,
        message: "Next approval stages must be unique",
      }
    }

    const invalidStage = uniqueStages.find(
      (stage) => !POST_STUDENT_AFFAIRS_APPROVERS.includes(stage)
    )
    if (invalidStage) {
      return {
        success: false,
        message: `Invalid approval stage selected: ${invalidStage}`,
      }
    }

    return {
      success: true,
      chain: uniqueStages,
      assignments: [],
      currentApproverUser: null,
    }
  }

  const uniqueStages = [...new Set(normalizedAssignments.map((assignment) => assignment.stage))]
  if (uniqueStages.length !== normalizedAssignments.length) {
    return {
      success: false,
      message: "Each next approval stage can only be assigned once",
    }
  }

  const invalidAssignment = normalizedAssignments.find(
    (assignment) =>
      !assignment.stage ||
      !POST_STUDENT_AFFAIRS_APPROVERS.includes(assignment.stage) ||
      !assignment.userId
  )
  if (invalidAssignment) {
    return {
      success: false,
      message:
        "Select a valid approver user for each chosen next approval stage",
    }
  }

  const uniqueUserIds = [...new Set(normalizedAssignments.map((assignment) => assignment.userId))]
  const users = await User.find({
    _id: { $in: uniqueUserIds },
    role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] },
  }).select("_id role subRole name email")

  const usersById = new Map(users.map((user) => [String(user._id), user]))

  for (const assignment of normalizedAssignments) {
    const matchedUser = usersById.get(assignment.userId)
    if (!matchedUser) {
      return {
        success: false,
        message: "One or more selected approver users could not be found",
      }
    }

    if (matchedUser.subRole !== assignment.stage) {
      return {
        success: false,
        message: `${matchedUser.name || matchedUser.email || "Selected user"} does not belong to ${assignment.stage}`,
      }
    }
  }

  return {
    success: true,
    chain: normalizedAssignments.map((assignment) => assignment.stage),
    assignments: normalizedAssignments,
    currentApproverUser: normalizedAssignments[0]?.userId || null,
  }
}

export const getCustomAssignmentState = (entity, currentStage) => {
  const assignments = Array.isArray(entity?.customApprovalAssignments)
    ? entity.customApprovalAssignments
    : []

  if (assignments.length === 0) {
    return {
      hasAssignments: false,
      assignments: [],
      currentIndex: -1,
      currentAssignment: null,
      nextAssignment: null,
    }
  }

  const currentApproverUser = normalizeObjectId(entity?.currentApproverUser)
  const rawIndex = Number.isInteger(entity?.currentChainIndex) ? entity.currentChainIndex : null
  let currentIndex =
    rawIndex !== null && rawIndex >= 0 && rawIndex < assignments.length ? rawIndex : -1

  if (currentIndex === -1) {
    currentIndex = assignments.findIndex((assignment) => {
      const stageMatches = assignment?.stage === currentStage
      if (!stageMatches) return false
      if (!currentApproverUser) return true
      return normalizeObjectId(assignment?.userId) === currentApproverUser
    })
  }

  return {
    hasAssignments: true,
    assignments,
    currentIndex,
    currentAssignment: currentIndex >= 0 ? assignments[currentIndex] : null,
    nextAssignment: currentIndex >= 0 ? assignments[currentIndex + 1] || null : null,
  }
}

export const getPostStudentAffairsApproverOptionsByStage = async () => {
  const users = await User.find({
    role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] },
    subRole: { $in: POST_STUDENT_AFFAIRS_APPROVERS },
  })
    .select("_id name email subRole")
    .lean()

  const stageOrder = new Map(
    POST_STUDENT_AFFAIRS_APPROVERS.map((stage, index) => [stage, index])
  )

  users.sort((left, right) => {
    const leftOrder = stageOrder.get(left?.subRole) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = stageOrder.get(right?.subRole) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder

    const leftName = String(left?.name || "").toLowerCase()
    const rightName = String(right?.name || "").toLowerCase()
    return leftName.localeCompare(rightName)
  })

  const optionsByStage = POST_STUDENT_AFFAIRS_APPROVERS.reduce((accumulator, stage) => {
    accumulator[stage] = []
    return accumulator
  }, {})

  for (const user of users) {
    const stage = normalizeStage(user?.subRole)
    if (!stage || !optionsByStage[stage]) continue

    const userId = normalizeObjectId(user?._id)
    if (!userId) continue

    optionsByStage[stage].push({
      value: userId,
      label: user?.email
        ? `${user?.name || "User"} (${user.email})`
        : user?.name || stage,
      userId,
      name: user?.name || "",
      email: user?.email || "",
      subRole: stage,
    })
  }

  return optionsByStage
}
