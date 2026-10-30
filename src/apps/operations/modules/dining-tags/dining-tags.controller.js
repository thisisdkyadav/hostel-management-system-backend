import { handler } from "../../../../lib/api-kit/index.js"
import {
  bulkSetStudentValues,
  createTag,
  getTagStudents,
  listTags,
  setStudentValue,
  setTagArchived,
  updateTag,
} from "./dining-tags.service.js"

export const list = handler((req) => listTags({ query: req.query }))
export const create = handler((req) => createTag({ user: req.user, body: req.body }))
export const update = handler((req) => updateTag({ params: req.params, body: req.body }))
export const archive = handler((req) => setTagArchived({ params: req.params, body: req.body }))
export const students = handler((req) => getTagStudents({ params: req.params, query: req.query }))
export const setValue = handler((req) => setStudentValue({ user: req.user, params: req.params, body: req.body }))
export const bulkValues = handler((req) => bulkSetStudentValues({ user: req.user, params: req.params, body: req.body }))
