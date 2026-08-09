/**
 * Student Profile Owner Service
 * -----------------------------
 * The single WRITE surface for the `StudentProfile` collection. Per the
 * domain-ownership rule, the model is mutated ONLY inside `src/services/student/`;
 * callers route every write through here (reads live in
 * studentProfileQueries.service.js).
 *
 * StudentProfile writes are all bulk/targeted mutations (no `.create()` /
 * `.insertMany()` anywhere in the app — profiles are created via the User flow /
 * bulkWrite upserts). These methods pass filter/update/options straight through
 * so callers keep their exact semantics, INCLUDING:
 *  - transaction { session }
 *  - Mongoose-9 pipeline-array updates via { updatePipeline: true } (see the
 *    mongoose9-upgrade note) — updateMany forwards options verbatim.
 *  - bulkWrite { ordered: false }.
 */

import { StudentProfile } from "../../models/index.js"

export const studentProfileOwner = {
  /** updateMany passthrough (filter, update|pipeline, options). Returns the raw result. */
  async updateMany(filter, update, options = {}) {
    return StudentProfile.updateMany(filter, update, options)
  },

  /** updateOne passthrough (filter, update, options e.g. { session }). Returns the raw result. */
  async updateOne(filter, update, options = {}) {
    return StudentProfile.updateOne(filter, update, options)
  },

  /** bulkWrite passthrough (ops, options e.g. { session, ordered:false }). */
  async bulkWrite(ops, options = {}) {
    return StudentProfile.bulkWrite(ops, options)
  },

  /** findOneAndUpdate by userId (options e.g. { new: true }). Returns doc or null. */
  async findOneAndUpdateByUser(userId, update, options = {}) {
    return StudentProfile.findOneAndUpdate({ userId }, update, options)
  },

  /**
   * RAW driver insertMany of pre-built profile docs (bypasses mongoose
   * validation/hooks by design — bulk import path). Options e.g. { session }.
   */
  async insertProfilesRaw(profileDocs, options = {}) {
    return StudentProfile.collection.insertMany(profileDocs, options)
  },
}

export default studentProfileOwner
