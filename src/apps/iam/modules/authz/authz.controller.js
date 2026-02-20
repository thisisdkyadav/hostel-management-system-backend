/**
 * AuthZ Controller
 */

import { authzService } from "./authz.service.js"
import { asyncHandler } from "../../../../utils/index.js"
import { Session } from "../../../../models/index.js"

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

  const activeSessions = await Session.find({ userId: targetUserId }).select("sessionId")

  await Promise.all(
    activeSessions.map((record) => {
      const sessionId = record?.sessionId
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

export const getAuthzCatalog = asyncHandler(async (req, res) => {
  const result = await authzService.getCatalog()
  return sendResult(res, result)
})

export const getMyAuthz = asyncHandler(async (req, res) => {
  const result = await authzService.getMyEffectiveAuthz(req.user._id)
  return sendResult(res, result)
})

export const getUserAuthz = asyncHandler(async (req, res) => {
  const { userId } = req.params
  const result = await authzService.getUserAuthz(userId)
  return sendResult(res, result)
})

export const getUsersByRole = asyncHandler(async (req, res) => {
  const { role } = req.params
  const { page, limit } = req.query

  const result = await authzService.getUsersByRole(role, { page, limit })
  return sendResult(res, result)
})

export const updateUserAuthz = asyncHandler(async (req, res) => {
  const { userId } = req.params
  const { override, reason } = req.body || {}

  const result = await authzService.updateUserOverride(userId, override, {
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

  const result = await authzService.resetUserOverride(userId, {
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
