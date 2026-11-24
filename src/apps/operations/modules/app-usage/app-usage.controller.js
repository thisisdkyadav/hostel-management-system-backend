import { handler } from "../../../../lib/api-kit/index.js"
import { getStats, recordPing } from "./app-usage.service.js"

export const ping = handler((req) => recordPing({ user: req.user, body: req.body }))
export const stats = handler(() => getStats())
