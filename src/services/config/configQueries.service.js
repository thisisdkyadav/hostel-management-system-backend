/**
 * Config Queries Service
 * ----------------------
 * The single READ surface for the `Configuration` collection. Every reader (the
 * config app-service, the configDefaults util, and the student profiles-admin
 * modules) reads through these instead of importing the model, so it is touched
 * only inside `src/services/config/` (writes live in configOwner.service.js).
 *
 * All reads are `findOne({ key })`; callers vary only in options, preserved here:
 *  - findByKey(key, { session }) → HYDRATED, optional transaction session
 *    (the profiles-admin txn reads pass a session; other callers omit it).
 *  - findByKeyLean(key) → `.lean()` plain object (bulk import read paths).
 */

import { Configuration } from "../../models/index.js"

export const configQueries = {
  /** One config by key, HYDRATED. Pass { session } to enlist in a transaction. */
  async findByKey(key, { session } = {}) {
    const query = Configuration.findOne({ key })
    if (session) query.session(session)
    return query
  },

  /** One config by key, LEAN (read-only import paths). */
  async findByKeyLean(key) {
    return Configuration.findOne({ key }).lean()
  },
}

export default configQueries
