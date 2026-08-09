/**
 * Election Owner Service
 * ----------------------
 * The single WRITE surface for the Election + ElectionNomination collections
 * (the vote sub-domain has its own voteOwner). Reads live in electionQueries.
 * Mutate-then-save flows go through persistElection/persistNomination.
 */

import { Election, ElectionNomination } from "../../models/index.js"

export const electionOwner = {
  // ---- Election ----

  /** Create an election. */
  async createElection(data) {
    return Election.create(data)
  },

  /**
   * findByIdAndUpdate an election. Mongoose options ({ new, runValidators })
   * pass through; { populate, lean } are applied as query modifiers. Returns
   * doc or null.
   */
  async updateElectionById(id, updates, { populate, lean, ...options } = {}) {
    let query = Election.findByIdAndUpdate(id, updates, options)
    if (populate) query = query.populate(populate)
    if (lean) query = query.lean()
    return query
  },

  /** Persist a hydrated election doc (mutate-then-save). */
  async persistElection(doc) {
    return doc.save()
  },

  // ---- ElectionNomination ----

  /** Create a nomination. */
  async createNomination(data) {
    return ElectionNomination.create(data)
  },

  /** Bulk-insert nominations (clone flow). Options e.g. { session }. */
  async insertNominations(docs, options = {}) {
    return ElectionNomination.insertMany(docs, options)
  },

  /** Persist a hydrated nomination doc (mutate-then-save). */
  async persistNomination(doc) {
    return doc.save()
  },
}

export default electionOwner
