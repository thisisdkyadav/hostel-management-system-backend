import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { h4Service } from "./h4.service.js"
import { h4Payments } from "./h4.payments.js"
import { h4Rooms } from "./h4.rooms.js"
import { h4Access } from "./h4.access.js"

const call = (fn) => asyncHandler(async (req, res) => sendStandardResponse(res, await fn(req)))
const file = (fn) =>
  asyncHandler(async (req, res) => {
    const result = await fn(req)
    if (!result.success) return sendStandardResponse(res, result)
    const { buffer, contentType, filename = "payment-proof" } = result.data
    res.setHeader("Content-Type", contentType || "application/octet-stream")
    res.setHeader("Cache-Control", "private, no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader(
      "Content-Disposition",
      `${req.query.disposition === "attachment" ? "attachment" : "inline"}; filename="${filename}"`,
    )
    return res.end(buffer)
  })
const id = (req) => req.params.requestId
export const options = call((req) => h4Service.options(req.user))
export const availability = call((req) => h4Service.availability(id(req), req.user))
export const list = call((req) => h4Service.list(req.user, req.query))
export const get = call((req) => h4Service.get(id(req), req.user))
export const create = call((req) => h4Service.createBatch(req.body, req.user))
export const edit = call((req) => h4Service.edit(id(req), req.body, req.user))
export const decision = call((req) => h4Service.decision(id(req), req.body, req.user, req.params.stage))
export const batchDecision = call((req) => h4Service.batchDecision(req.body, req.user))
export const offer = call((req) => h4Payments.offer(id(req), req.body, req.user))
export const submitPayment = call((req) => h4Payments.submit(id(req), req.body, req.user))
export const defer = call((req) => h4Payments.defer(id(req), req.body, req.user))
export const verify = call((req) => h4Payments.verify(id(req), req.body, req.user))
export const settle = call((req) => h4Payments.settle(id(req), req.body, req.user))
export const schedule = call((req) => h4Service.schedule(id(req), req.body, req.user))
export const cancel = call((req) => h4Service.cancel(id(req), req.body, req.user))
export const roomCheck = call((req) => h4Rooms.preview(id(req), req.body, req.user))
export const assign = call((req) => h4Rooms.assign(id(req), req.body, req.user))
export const checkIn = call((req) => h4Service.arrival(id(req), req.body, req.user))
export const checkOut = call((req) => h4Service.arrival(id(req), req.body, req.user, true))
export const upload = call((req) => h4Access.upload(id(req), req.file, req.user, Number(req.body.revision)))
export const resend = call((req) => h4Access.resend(id(req), req.body, req.user))
export const invoice = file((req) => h4Service.invoice(id(req), req.user))
export const qr = file((req) => h4Access.requestQr(id(req), req.user))
export const proof = file((req) => h4Payments.attachment(id(req), req.user, req.query.additionalPaymentId))
export const exportInvoices = file((req) => h4Service.exportInvoices(req.query, req.user))
export const publicView = call((req) => h4Access.view(req.h4Access))
export const publicInvoice = file((req) => h4Access.invoice(req.h4Access))
export const publicQr = file((req) => h4Access.qr(req.h4Access))
export const publicPayment = call(async (req) =>
  h4Access.response(
    await h4Payments.submit(String(req.h4Access.request._id), req.body, req.h4Access.user),
    req.h4Access,
  ),
)
export const publicDefer = call(async (req) =>
  h4Access.response(
    await h4Payments.defer(String(req.h4Access.request._id), req.body, req.h4Access.user),
    req.h4Access,
  ),
)
export const publicSchedule = call(async (req) =>
  h4Access.response(
    await h4Service.schedule(String(req.h4Access.request._id), req.body, req.h4Access.user),
    req.h4Access,
  ),
)
export const publicUpload = call((req) =>
  h4Access.upload(String(req.h4Access.request._id), req.file, req.h4Access.user, Number(req.body.revision)),
)
