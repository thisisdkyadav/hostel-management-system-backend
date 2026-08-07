/**
 * Election Vote Queries Service
 * -----------------------------
 * The single READ surface for the ElectionVote collection. Every module that
 * needs to read cast ballots (elections.service, elections-voting-dispatch)
 * calls these methods instead of importing the model, so `ElectionVote` is
 * touched only inside `src/services/elections/` (writes live in
 * voteOwner.service.js). Reads carry no data-integrity risk; centralising them
 * completes the ownership boundary.
 *
 * Tallies are DERIVED here on read (there are no stored counters), so these
 * aggregations are the source of truth for live stats, results, and per-post
 * counts. Aggregation `$match` does not auto-cast a string id to ObjectId the
 * way find()/countDocuments() do, so aggregate-based reads cast electionId
 * explicitly.
 */

import mongoose from "mongoose"
import { ElectionVote } from "../../models/index.js"

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value))

export const voteQueries = {
  /**
   * The one existing-vote guard used by both submit paths (portal + email
   * token). Returns the vote doc (or null); callers read truthiness and
   * `castAt`. Note: a voter has one doc PER post, so this returns the first
   * matching post's vote — enough to prove the voter has already voted in this
   * election.
   */
  async findVoteByElectionAndVoter({ electionId, voterUserId }, { session } = {}) {
    const q = ElectionVote.findOne({ electionId, voterUserId })
    return (session ? q.session(session) : q).lean()
  },

  /**
   * Per-post vote totals for an election: [{ _id: postId, count, lastCastAt }].
   * Callers that only need `count` (getVoteCountsByPost) ignore lastCastAt.
   */
  async aggregateVoteCountsByPost(electionId) {
    return ElectionVote.aggregate([
      { $match: { electionId: toObjectId(electionId) } },
      {
        $group: {
          _id: "$postId",
          count: { $sum: 1 },
          lastCastAt: { $max: "$castAt" },
        },
      },
    ])
  },

  /**
   * Per-candidate vote totals for an election:
   * [{ _id: { postId, candidateNominationId, isNota }, count }].
   * Drives buildElectionResults and the live-stats candidate breakdown.
   */
  async aggregateCandidateVoteCounts(electionId) {
    return ElectionVote.aggregate([
      { $match: { electionId: toObjectId(electionId) } },
      {
        $group: {
          _id: {
            postId: "$postId",
            candidateNominationId: "$candidateNominationId",
            isNota: "$isNota",
          },
          count: { $sum: 1 },
        },
      },
    ])
  },

  /** Distinct voter user ids who have cast at least one vote in the election. */
  async distinctVoterIds(electionId) {
    return ElectionVote.distinct("voterUserId", { electionId })
  },

  /** How many votes exist across the given posts of an election (removal guard). */
  async countVotesForPosts({ electionId, postIds }) {
    return ElectionVote.countDocuments({
      electionId,
      postId: { $in: (postIds || []).map(toObjectId) },
    })
  },

  /** Election ids (from a candidate set) in which this voter has voted. */
  async distinctVotedElectionIds({ electionIds, voterUserId }) {
    return ElectionVote.distinct("electionId", {
      electionId: { $in: electionIds },
      voterUserId,
    })
  },

  /** This voter's votes across a candidate set of elections (lean docs). */
  async findVotesByVoter({ electionIds, voterUserId }) {
    return ElectionVote.find({
      electionId: { $in: electionIds },
      voterUserId,
    }).lean()
  },
}

export default voteQueries
