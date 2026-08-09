/**
 * Staff Roles Queries Service
 * ---------------------------
 * The single READ surface for the 8 staff role sub-models (Admin, Warden,
 * AssociateWarden, HostelSupervisor, MaintenanceStaff, Security, HostelGate,
 * Gymkhana). Keyed by `roleKey`; writes live in staffRolesOwner.service.js.
 *
 * Methods encode each caller's exact populate/select/lean shape. The
 * warden-family (Warden/AssociateWarden/HostelSupervisor) share identical
 * profile/list shapes, so they share these methods via roleKey.
 */

import {
  Admin,
  Warden,
  AssociateWarden,
  HostelSupervisor,
  MaintenanceStaff,
  Security,
  HostelGate,
  Gymkhana,
} from "../../models/index.js"

const ROLE_MODELS = {
  Admin,
  Warden,
  AssociateWarden,
  HostelSupervisor,
  MaintenanceStaff,
  Security,
  HostelGate,
  Gymkhana,
}

const resolve = (roleKey) => {
  const model = ROLE_MODELS[roleKey]
  if (!model) throw new Error(`Unknown staff role model: ${roleKey}`)
  return model
}

export const staffRolesQueries = {
  /**
   * Role profile by userId with userId + hostelIds + activeHostelId populated
   * (warden-family getProfile). HYDRATED (caller calls .toObject()).
   */
  async findProfileByUserIdWithHostels(roleKey, userId) {
    return resolve(roleKey)
      .findOne({ userId })
      .populate("userId", "name email role phone profileImage")
      .populate("hostelIds", "name type")
      .populate("activeHostelId", "name type")
  },

  /** All role profiles with userId (name/email/phone/image) populated, LEAN (warden-family list views). */
  async listWithUser(roleKey) {
    return resolve(roleKey).find().populate("userId", "name email phone profileImage").lean()
  },

  /** Same populate, HYDRATED (Security / MaintenanceStaff lists that used .exec()). */
  async listWithUserHydrated(roleKey) {
    return resolve(roleKey).find().populate("userId", "name email phone profileImage")
  },

  /** Role profile by _id with a select projection. { lean } optional. */
  async findByIdSelect(roleKey, id, select, { lean } = {}) {
    const query = resolve(roleKey).findById(id).select(select)
    return lean ? query.lean() : query
  },

  /** Role profile by userId. Bare = HYDRATED (mutate-then-save). Options: { select, lean }. */
  async findByUserId(roleKey, userId, { select, lean } = {}) {
    let query = resolve(roleKey).findOne({ userId })
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** Role profiles for a set of userIds. Options: { select, lean }. */
  async findByUserIds(roleKey, userIds, { select, lean } = {}) {
    let query = resolve(roleKey).find({ userId: { $in: userIds } })
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },
}

export default staffRolesQueries
