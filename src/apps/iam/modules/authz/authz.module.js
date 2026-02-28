/**
 * AuthZ module
 * Single-module implementation for AuthZ HTTP handlers + business logic.
 */

import { User, AuthzAudit } from "../../../../models/index.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import {
  AUTHZ_CATALOG,
  buildEffectiveAuthzForUser,
  extractUserAuthzOverride,
  normalizeAuthzOverride,
  validateAuthzOverride,
} from "../../../../core/authz/index.js"
import { success, badRequest, notFound } from "../../../../services/base/index.js"
import { asyncHandler } from "../../../../utils/index.js"
import { listUserSessionIds } from "../../../../services/session/redisSessionMeta.service.js"

const VALID_ROLES = Object.values(ROLES)

const normalizeRoleList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

const sendResult = (res, result) => {
  return res.status(result.statusCode || 200).json({
    success: result.success,
    message: result.message,
    data: result.data,
    errors: result.errors,
  })
}

const syncUserAuthzAcrossActiveSessions = async ({ sessionStore, targetUserId, authz }) => {
  if (!sessionStore || !targetUserId || !authz) return

  const activeSessionIds = await listUserSessionIds(targetUserId)

  await Promise.all(
    activeSessionIds.map((sessionId) => {
      if (!sessionId) return Promise.resolve()

      return new Promise((resolve) => {
        sessionStore.get(sessionId, (getErr, sessionData) => {
          if (getErr || !sessionData) {
            resolve()
            return
          }

          const nextSessionData = {
            ...sessionData,
            userData: {
              ...(sessionData.userData || {}),
              authz,
            },
          }

          sessionStore.set(sessionId, nextSessionData, () => resolve())
        })
      })
    })
  )
}

const getCatalogResult = async () => {
  return success({
    catalog: AUTHZ_CATALOG,
    generatedAt: new Date().toISOString(),
  })
}

const getMyAuthzResult = async (userId) => {
  const user = await User.findById(userId).select("_id name email role subRole authz")
  if (!user) return notFound("User")

  return success({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      subRole: user.subRole || null,
    },
    authz: {
      override: extractUserAuthzOverride(user),
      effective: buildEffectiveAuthzForUser(user),
    },
  })
}

const getUserAuthzResult = async (userId) => {
  const user = await User.findById(userId).select("_id name email role subRole authz")
  if (!user) return notFound("User")

  return success({
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      subRole: user.subRole || null,
    },
    authz: {
      override: extractUserAuthzOverride(user),
      effective: buildEffectiveAuthzForUser(user),
      meta: user.authz?.meta || null,
    },
  })
}

const getUsersByRoleResult = async (role, { page = 1, limit = 20, excludeRoles = [] } = {}) => {
  if (role && !VALID_ROLES.includes(role)) {
    return badRequest("Invalid role specified")
  }

  const normalizedExcludedRoles = [...new Set(normalizeRoleList(excludeRoles))]
  const invalidExcludedRoles = normalizedExcludedRoles.filter((item) => !VALID_ROLES.includes(item))
  if (invalidExcludedRoles.length > 0) {
    return badRequest(`Invalid excludeRoles specified: ${invalidExcludedRoles.join(", ")}`)
  }

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1)
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)

  const query = {}
  if (role) {
    if (normalizedExcludedRoles.includes(role)) {
      return success({
        data: [],
        pagination: {
          total: 0,
          page: parsedPage,
          limit: parsedLimit,
          pages: 0,
        },
      })
    }
    query.role = role
  } else if (normalizedExcludedRoles.length > 0) {
    query.role = { $nin: normalizedExcludedRoles }
  }

  const users = await User.find(query)
    .skip((parsedPage - 1) * parsedLimit)
    .limit(parsedLimit)
    .sort({ role: 1, name: 1 })
    .select("_id name email role subRole authz")

  const total = await User.countDocuments(query)
  const data = users.map((user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    subRole: user.subRole || null,
    authz: {
      override: extractUserAuthzOverride(user),
    },
  }))

  return success({
    data,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      pages: Math.ceil(total / parsedLimit),
    },
  })
}

const updateUserOverrideResult = async (userId, overrideInput, actor = {}) => {
  const validation = validateAuthzOverride(overrideInput)
  if (!validation.isValid) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid authz override payload",
      errors: validation.errors,
    }
  }

  const user = await User.findById(userId).select("_id name email role authz")
  if (!user) return notFound("User")

  const beforeOverride = extractUserAuthzOverride(user)
  const nextOverride = normalizeAuthzOverride(validation.normalized)

  user.authz = user.authz || {}
  user.authz.override = nextOverride
  user.authz.meta = {
    version: (user.authz?.meta?.version || 1) + 1,
    updatedBy: actor._id || null,
    updatedAt: new Date(),
  }

  await user.save()

  await AuthzAudit.create({
    targetUserId: user._id,
    targetRole: user.role,
    action: "update",
    changedBy: actor._id || user._id,
    reason: actor.reason || null,
    beforeOverride,
    afterOverride: nextOverride,
  })

  return success({
    message: "AuthZ override updated successfully",
    userId: user._id,
    authz: {
      override: nextOverride,
      effective: buildEffectiveAuthzForUser(user),
      meta: user.authz?.meta || null,
    },
  })
}

const resetUserOverrideResult = async (userId, actor = {}) => {
  const user = await User.findById(userId).select("_id name email role authz")
  if (!user) return notFound("User")

  const beforeOverride = extractUserAuthzOverride(user)
  const afterOverride = normalizeAuthzOverride({})

  user.authz = user.authz || {}
  user.authz.override = afterOverride
  user.authz.meta = {
    version: (user.authz?.meta?.version || 1) + 1,
    updatedBy: actor._id || null,
    updatedAt: new Date(),
  }

  await user.save()

  await AuthzAudit.create({
    targetUserId: user._id,
    targetRole: user.role,
    action: "reset",
    changedBy: actor._id || user._id,
    reason: actor.reason || null,
    beforeOverride,
    afterOverride,
  })

  return success({
    message: "AuthZ override reset successfully",
    userId: user._id,
    authz: {
      override: afterOverride,
      effective: buildEffectiveAuthzForUser(user),
      meta: user.authz?.meta || null,
    },
  })
}

export const getAuthzCatalog = asyncHandler(async (_req, res) => {
  const result = await getCatalogResult()
  return sendResult(res, result)
})

export const getMyAuthz = asyncHandler(async (req, res) => {
  const result = await getMyAuthzResult(req.user._id)
  return sendResult(res, result)
})

export const getUserAuthz = asyncHandler(async (req, res) => {
  const result = await getUserAuthzResult(req.params.userId)
  return sendResult(res, result)
})

export const getUsersByRole = asyncHandler(async (req, res) => {
  const { role } = req.params
  const { page, limit, excludeRoles } = req.query
  const result = await getUsersByRoleResult(role, { page, limit, excludeRoles })
  return sendResult(res, result)
})

export const updateUserAuthz = asyncHandler(async (req, res) => {
  const { userId } = req.params
  const { override, reason } = req.body || {}

  const result = await updateUserOverrideResult(userId, override, {
    _id: req.user._id,
    reason,
  })

  if (result.success && result.data?.authz) {
    if (req.session?.userId && String(req.session.userId) === String(userId)) {
      req.session.userData = {
        ...(req.session.userData || {}),
        authz: result.data.authz,
      }
    }

    await syncUserAuthzAcrossActiveSessions({
      sessionStore: req.sessionStore,
      targetUserId: userId,
      authz: result.data.authz,
    })
  }

  return sendResult(res, result)
})

export const resetUserAuthz = asyncHandler(async (req, res) => {
  const { userId } = req.params
  const { reason } = req.body || {}

  const result = await resetUserOverrideResult(userId, {
    _id: req.user._id,
    reason,
  })

  if (result.success && result.data?.authz) {
    if (req.session?.userId && String(req.session.userId) === String(userId)) {
      req.session.userData = {
        ...(req.session.userData || {}),
        authz: result.data.authz,
      }
    }

    await syncUserAuthzAcrossActiveSessions({
      sessionStore: req.sessionStore,
      targetUserId: userId,
      authz: result.data.authz,
    })
  }

  return sendResult(res, result)
})

export const authzModule = {
  getCatalogResult,
  getMyAuthzResult,
  getUserAuthzResult,
  getUsersByRoleResult,
  updateUserOverrideResult,
  resetUserOverrideResult,
}

export default authzModule
