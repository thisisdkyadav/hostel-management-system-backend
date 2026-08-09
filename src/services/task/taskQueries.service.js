/**
 * Task Queries Service
 * --------------------
 * The single READ surface for the `Task` collection. The tasks app-service and
 * the admin stats service read through these instead of importing the model, so
 * it is touched only inside `src/services/task/` (writes live in
 * taskOwner.service.js).
 *
 * findTasksPaginated mirrors the old BaseService.findPaginated math exactly
 * (skip = (page-1)*limit, parseInt on page/limit, populate array applied in
 * order) but returns raw { items, total } — the caller builds its own
 * pagination response shape.
 */

import { Task } from "../../models/index.js"

export const taskQueries = {
  /** Paginated task list. Returns { items, total } (caller shapes pagination). */
  async findTasksPaginated(filter, { page = 1, limit = 10, sort = { createdAt: -1 }, populate = [] }) {
    const skip = (parseInt(page) - 1) * parseInt(limit)
    let query = Task.find(filter).sort(sort).skip(skip).limit(parseInt(limit))
    if (Array.isArray(populate)) {
      populate.forEach((p) => {
        query = query.populate(p)
      })
    }
    const [items, total] = await Promise.all([query.exec(), Task.countDocuments(filter)])
    return { items, total }
  },

  /** One task by id, HYDRATED (mutate-then-save: status / detail updates). */
  async findTaskById(id) {
    return Task.findById(id)
  },

  /** Group-count tasks by a field ($group _id: '$field', count). Admin stats. */
  async aggregateCountByField(field) {
    return Task.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }])
  },

  /** Count tasks matching a filter (e.g. overdue). */
  async countTasks(filter) {
    return Task.countDocuments(filter)
  },
}

export default taskQueries
