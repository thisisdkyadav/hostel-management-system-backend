/**
 * AuthZ Service
 * Layer-3 authorization service (additive over existing RBAC).
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

const VALID_ROLES = Object.values(ROLES)

class AuthzService {
  async getCatalog() {
    return success({
      catalog: AUTHZ_CATALOG,
      generatedAt: new Date().toISOString(),
    })
  }

  async getMyEffectiveAuthz(userId) {
    const user = await User.findById(userId).select("_id name email role subRole authz")

    if (!user) {
      return notFound("User")
    }

    const override = extractUserAuthzOverride(user)
    const effective = buildEffectiveAuthzForUser(user)

    return success({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        subRole: user.subRole || null,
      },
      authz: {
        override,
        effective,
      },
    })
  }

  async getUserAuthz(userId) {
    const user = await User.findById(userId).select("_id name email role subRole authz")

    if (!user) {
      return notFound("User")
    }

    const override = extractUserAuthzOverride(user)
    const effective = buildEffectiveAuthzForUser(user)

    return success({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        subRole: user.subRole || null,
      },
      authz: {
        override,
        effective,
        meta: user.authz?.meta || null,
      },
    })
  }

  async getUsersByRole(role, { page = 1, limit = 20 } = {}) {
    if (role && !VALID_ROLES.includes(role)) {
      return badRequest("Invalid role specified")
    }

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1)
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)

    const query = role ? { role } : {}
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

  async updateUserOverride(userId, overrideInput, actor = {}) {
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
    if (!user) {
      return notFound("User")
    }

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

  async resetUserOverride(userId, actor = {}) {
    const user = await User.findById(userId).select("_id name email role authz")
    if (!user) {
      return notFound("User")
    }

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
}

export const authzService = new AuthzService()
export default authzService
