/**
 * Election Queries Service
 * ------------------------
 * The single READ surface for the Election + ElectionNomination collections
 * (the vote sub-domain has its own voteQueries). Repository-style: Election and
 * ElectionNomination are queried many ways, so callers build the filter and pass
 * { select, lean, sort } — model access stays owned here.
 */

import { Election, ElectionNomination } from "../../models/index.js"

/** Apply a mongoose populate arg (single spec or array of specs) to a query. */
const applyPopulate = (query, populate) => {
  if (!populate) return query
  if (Array.isArray(populate)) {
    populate.forEach((p) => { query = query.populate(p) })
    return query
  }
  return query.populate(populate)
}

export const electionQueries = {
  // ---- Election ----

  /** Elections by filter. Options: { select, lean, sort, limit }. */
  async findElections(filter = {}, { select, lean, sort, limit } = {}) {
    let query = Election.find(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    if (limit) query = query.limit(limit)
    if (lean) query = query.lean()
    return query
  },

  /** One election by id. Options: { select, lean }. */
  async findElectionById(id, { select, lean } = {}) {
    let query = Election.findById(id)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** One election by filter. Options: { select, lean, sort }. */
  async findOneElection(filter, { select, lean, sort } = {}) {
    let query = Election.findOne(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    if (lean) query = query.lean()
    return query
  },

  /** Count elections matching a filter. */
  async countElections(filter = {}) {
    return Election.countDocuments(filter)
  },

  // ---- ElectionNomination ----

  /** Nominations by filter. Options: { select, lean, sort, populate }. */
  async findNominations(filter = {}, { select, lean, sort, populate } = {}) {
    let query = ElectionNomination.find(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    query = applyPopulate(query, populate)
    if (lean) query = query.lean()
    return query
  },

  /** One nomination by filter. Options: { select, lean, sort, populate }. */
  async findOneNomination(filter, { select, lean, sort, populate } = {}) {
    let query = ElectionNomination.findOne(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    query = applyPopulate(query, populate)
    if (lean) query = query.lean()
    return query
  },

  /** One nomination by id. Options: { select, lean, populate }. */
  async findNominationById(id, { select, lean, populate } = {}) {
    let query = ElectionNomination.findById(id)
    if (select) query = query.select(select)
    query = applyPopulate(query, populate)
    if (lean) query = query.lean()
    return query
  },

  /** Count nominations matching a filter. */
  async countNominations(filter = {}) {
    return ElectionNomination.countDocuments(filter)
  },

  /** distinct(field) over a nomination filter. */
  async distinctNominationField(field, filter = {}) {
    return ElectionNomination.distinct(field, filter)
  },

  /** Aggregate over nominations. */
  async aggregateNominations(pipeline) {
    return ElectionNomination.aggregate(pipeline)
  },
}

export default electionQueries
