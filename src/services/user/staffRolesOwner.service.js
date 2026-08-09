/**
 * Staff Roles Owner Service
 * -------------------------
 * The single WRITE surface for the 8 staff role sub-model collections:
 * Admin, Warden, AssociateWarden, HostelSupervisor, MaintenanceStaff, Security,
 * HostelGate, Gymkhana. Per the domain-ownership rule + the user's SPLIT choice,
 * these role profiles are mutated ONLY inside `src/services/user/` (core User
 * lives in userOwner/userQueries; reads for these roles in staffRolesQueries).
 *
 * Methods are keyed by a `roleKey` (the model name) rather than one method per
 * model — the 8 role models share near-identical CRUD shapes. resolve() throws
 * on an unknown key so a typo fails loudly instead of silently no-op'ing.
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

export const staffRolesOwner = {
  /** Create a role profile. */
  async create(roleKey, data) {
    return resolve(roleKey).create(data)
  },

  /** findByIdAndUpdate({ new: true }).lean() — warden-family update (existence-checked by caller). */
  async updateByIdReturnLean(roleKey, id, updates) {
    return resolve(roleKey).findByIdAndUpdate(id, updates, { new: true }).lean()
  },

  /** Generic findByIdAndUpdate (options e.g. { new: true }, HYDRATED). Returns doc or null. */
  async updateById(roleKey, id, updates, options = {}) {
    return resolve(roleKey).findByIdAndUpdate(id, updates, options)
  },

  /** deleteOne by userId (returns the raw result — Gymkhana user cascade). */
  async deleteOneByUserId(roleKey, userId) {
    return resolve(roleKey).deleteOne({ userId })
  },

  /** Delete a role profile by id. Returns the deleted doc or null. */
  async deleteById(roleKey, id) {
    return resolve(roleKey).findByIdAndDelete(id)
  },

  /** Persist a hydrated role-profile doc (mutate-then-save: set active hostel). */
  async persist(doc) {
    return doc.save()
  },

  /** findOneAndUpdate by userId (options e.g. { new, upsert }) — role-profile upsert. */
  async findOneAndUpdateByUserId(roleKey, userId, update, options = {}) {
    return resolve(roleKey).findOneAndUpdate({ userId }, update, options)
  },

  /** updateOne by userId (options e.g. { upsert: true } — raw result). */
  async updateOneByUserId(roleKey, userId, update, options = {}) {
    return resolve(roleKey).updateOne({ userId }, update, options)
  },

  /** findOneAndDelete by userId. Returns the deleted doc or null. */
  async findOneAndDeleteByUserId(roleKey, userId) {
    return resolve(roleKey).findOneAndDelete({ userId })
  },
}

export default staffRolesOwner
