/**
 * Election Vote Owner Service
 * ---------------------------
 * The single owner of all WRITES to the ElectionVote collection. The ballot
 * submit paths (portal + email token) build the per-post vote docs and hand
 * them here; nothing else inserts votes.
 *
 * Invariant guaranteed on commit:
 *   - A ballot is ALL-OR-NOTHING: either every post's vote for a voter lands,
 *     or none does. A mid-batch failure never leaves a voter with a partial
 *     ballot that would then trip the "already voted" guard and lock them out
 *     of the posts they never actually voted for.
 *   - A voter can hold at most one vote per (election, post), enforced by the
 *     unique index { electionId, postId, voterUserId }.
 *
 * How it stays correct where the old code did not:
 *   - insertMany runs inside a TRANSACTION, so any error (a concurrent
 *     double-submit hitting the unique index, or a transient write failure
 *     mid-batch) aborts the whole insert — no partial ballot.
 *   - The unique index is the real concurrency guard: two requests that both
 *     pass the pre-check findOne race into insert; exactly one wins, the other
 *     gets E11000, which we translate into a graceful `{ duplicate: true }`
 *     instead of surfacing a raw 500.
 */

import mongoose from "mongoose"
import { withTransaction } from "../base/index.js"
import { ElectionVote } from "../../models/index.js"

const isDuplicateKeyError = (err) => {
  if (!err) return false
  if (err.code === 11000) return true
  if (Array.isArray(err.writeErrors)) {
    if (err.writeErrors.some((we) => (we?.code ?? we?.err?.code) === 11000)) return true
  }
  return typeof err.message === "string" && err.message.includes("E11000")
}

export const voteOwner = {
  /**
   * Insert a full ballot (one doc per post) atomically.
   *
   * @param {{ voteDocs: object[] }} args - fully-built ElectionVote docs
   * @returns {Promise<{ ok: true, insertedCount: number } | { ok: false, duplicate: true }>}
   *   `{ ok: false, duplicate: true }` means this voter already has a vote for
   *   at least one of these posts (concurrent double-submit) — the caller should
   *   report "already voted", not an error.
   */
  async castBallot({ voteDocs }) {
    if (!Array.isArray(voteDocs) || voteDocs.length === 0) {
      return { ok: true, insertedCount: 0 }
    }

    try {
      const inserted = await withTransaction(async (session) =>
        ElectionVote.insertMany(voteDocs, { session, ordered: true })
      )
      return { ok: true, insertedCount: inserted.length }
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return { ok: false, duplicate: true }
      }
      throw err
    }
  },
}

export default voteOwner
