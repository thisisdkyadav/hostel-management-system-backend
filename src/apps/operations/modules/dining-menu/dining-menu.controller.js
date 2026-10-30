import { handler } from "../../../../lib/api-kit/index.js"
import {
  copyMenu,
  deleteWeek,
  getMenu,
  listMenuCaterers,
  listVersions,
  resetDates,
  saveDates,
  saveWeek,
  searchItems,
} from "./dining-menu.service.js"

export const caterers = handler(() => listMenuCaterers())
export const menu = handler((req) => getMenu({ query: req.query }))
export const versions = handler((req) => listVersions({ query: req.query }))
export const putWeek = handler((req) => saveWeek({ user: req.user, body: req.body }))
export const removeWeek = handler((req) => deleteWeek({ query: req.query }))
export const putDates = handler((req) => saveDates({ user: req.user, body: req.body }))
export const removeDates = handler((req) => resetDates({ user: req.user, body: req.body }))
export const copy = handler((req) => copyMenu({ user: req.user, body: req.body }))
export const items = handler((req) => searchItems({ query: req.query }))
