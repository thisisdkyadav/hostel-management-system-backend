/**
 * Lost & Found Owner Service
 * --------------------------
 * The single WRITE surface for the `LostAndFound` collection (hostel
 * lost-and-found items). Per the domain-ownership rule, the model is mutated
 * ONLY inside `src/services/lost-found/`; the lost-and-found app-service routes
 * every write through here (reads live in lostAndFoundQueries.service.js).
 *
 * No pre-save hook (dateFound is a schema default). updateItemById uses
 * { new: true, runValidators: true } to match the BaseService.updateById the
 * app-service previously inherited (schema has min/max length validators).
 */

import { LostAndFound } from "../../models/index.js"

export const lostAndFoundOwner = {
  /** Create a lost-and-found item. Throws on error (caller maps envelope). */
  async createItem(data) {
    return LostAndFound.create(data)
  },

  /**
   * Update an item by id ({ new: true, runValidators: true }, matching the old
   * BaseService.updateById). Returns the updated doc or null (not found).
   */
  async updateItemById(id, updates) {
    return LostAndFound.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
  },

  /** Delete an item by id. Returns the deleted doc or null. */
  async deleteItemById(id) {
    return LostAndFound.findByIdAndDelete(id)
  },
}

export default lostAndFoundOwner
