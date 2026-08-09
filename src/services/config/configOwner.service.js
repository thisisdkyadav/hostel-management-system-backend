/**
 * Config Owner Service
 * --------------------
 * The single WRITE surface for the `Configuration` collection (system
 * key-value settings). Per the domain-ownership rule, the model is mutated ONLY
 * inside `src/services/config/`; the config app-service and the configDefaults
 * util route every write through here (reads live in configQueries.service.js).
 *
 * Semantics preserved exactly:
 *  - createConfig uses the save path so the `pre("save")` hook fires (lastUpdated) —
 *    equivalent to the old `new Configuration(data).save()` in configDefaults.
 *  - upsertConfig mirrors the old BaseService.upsert: findOneAndUpdate with
 *    `{ $set: data }` and `{ new: true, upsert: true, runValidators: true }`.
 *    (findOneAndUpdate does NOT fire the pre-save hook, but callers pass an
 *    explicit lastUpdated in `data`, matching the original behavior.)
 */

import { Configuration } from "../../models/index.js"

export const configOwner = {
  /** Create a configuration doc (save path — pre-save hook sets lastUpdated). */
  async createConfig(data) {
    return Configuration.create(data)
  },

  /** Upsert a config by filter, `$set`-ing data (mirrors BaseService.upsert). */
  async upsertConfig(filter, data) {
    return Configuration.findOneAndUpdate(
      filter,
      { $set: data },
      { new: true, upsert: true, runValidators: true }
    )
  },
}

export default configOwner
