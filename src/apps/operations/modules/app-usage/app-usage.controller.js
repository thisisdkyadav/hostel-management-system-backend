import { handler } from "../../../../lib/api-kit/index.js"
import { getRoleSummary, getStats, getUserActivity, listRoleUsers, recordPageVisit, recordPing } from "./app-usage.service.js"

export const ping = handler((req) => recordPing({ user: req.user, body: req.body }))
export const stats = handler(() => getStats())
export const visit = handler((req) => recordPageVisit({ user: req.user, body: req.body }))
export const roles = handler(() => getRoleSummary())
export const users = handler((req) => listRoleUsers({ query: req.query }))
export const userActivity = handler((req) => getUserActivity({ userId: req.params.userId }))
