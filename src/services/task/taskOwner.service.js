/**
 * Task Owner Service
 * ------------------
 * The single WRITE surface for the `Task` collection (staff tasks). Per the
 * domain-ownership rule, the model is mutated ONLY inside `src/services/task/`;
 * the tasks app-service routes every write through here (reads live in
 * taskQueries.service.js).
 *
 * Task has a `pre("save")` hook (sets updatedAt AND auto-flips Created→Assigned
 * when users are assigned). createTask and persistTask go through the save path
 * so the hook FIRES — matching the original `this.create()` and instance
 * `.save()` calls. deleteTaskById replaces the inherited BaseService.deleteById.
 */

import { Task } from "../../models/index.js"

export const taskOwner = {
  /** Create a task (save path — pre-save hook fires). Throws on error. */
  async createTask(data) {
    return Task.create(data)
  },

  /** Persist a hydrated Task doc (save path — hook fires: status update flows). */
  async persistTask(taskDoc) {
    return taskDoc.save()
  },

  /** Delete a task by id. Returns the deleted doc or null. */
  async deleteTaskById(id) {
    return Task.findByIdAndDelete(id)
  },
}

export default taskOwner
