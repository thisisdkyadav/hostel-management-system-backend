import express from "express"
import multer from "multer"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { asyncHandler } from "../../../../utils/index.js"
import { resolveAccess } from "./h4.access.js"
import * as ctrl from "./h4.controller.js"

export const H4_ROUTE_KEYS = {
  Student: "route.student.internAccommodation",
  Academics: "route.academics.internAccommodation",
  Admin: "route.admin.internAccommodation",
  "Hostel Supervisor": "route.hostelSupervisor.internAccommodation",
  "Hostel Gate": "route.hostelGate.internAccommodation",
  Warden: "route.warden.internAccommodation",
  "Associate Warden": "route.associateWarden.internAccommodation",
  Security: "route.security.internAccommodation",
  "Maintenance Staff": "route.maintenance.internAccommodation",
  Gymkhana: "route.gymkhana.internAccommodation",
  "Super Admin": "route.superAdmin.internAccommodation",
  Dining: "route.dining.internAccommodation",
}
const router = express.Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single(
  "image",
)
const access = asyncHandler(async (req, res, next) => {
  req.h4Access = await resolveAccess(req.params.token)
  if (!req.h4Access)
    return res.status(404).json({
      success: false,
      message: "This access link is invalid or expired. Ask the requester or CW Office to resend it.",
    })
  res.setHeader("Cache-Control", "private, no-store")
  return next()
})
router.get("/access/:token", access, ctrl.publicView)
router.post("/access/:token/payment", access, ctrl.publicPayment)
router.post("/access/:token/defer", access, ctrl.publicDefer)
router.post("/access/:token/schedule", access, ctrl.publicSchedule)
router.post("/access/:token/proof", access, upload, ctrl.publicUpload)
router.get("/access/:token/invoice", access, ctrl.publicInvoice)
router.get("/access/:token/qr", access, ctrl.publicQr)
router.use(authenticate, routeGuard(H4_ROUTE_KEYS).access)
router.get("/options", ctrl.options)
router.get("/requests", ctrl.list)
router.post("/batches", ctrl.create)
router.post("/batch-decision", ctrl.batchDecision)
router.get("/invoices/export", ctrl.exportInvoices)
router.get("/requests/:requestId", ctrl.get)
router.get("/requests/:requestId/availability", ctrl.availability)
router.get("/requests/:requestId/invoice", ctrl.invoice)
router.get("/requests/:requestId/proof", ctrl.proof)
router.get("/requests/:requestId/qr", ctrl.qr)
router.post("/requests/:requestId/edit", ctrl.edit)
router.post("/requests/:requestId/decision/:stage", ctrl.decision)
router.post("/requests/:requestId/offer", ctrl.offer)
router.post("/requests/:requestId/payment", ctrl.submitPayment)
router.post("/requests/:requestId/defer", ctrl.defer)
router.post("/requests/:requestId/verify", ctrl.verify)
router.post("/requests/:requestId/settle", ctrl.settle)
router.post("/requests/:requestId/schedule", ctrl.schedule)
router.post("/requests/:requestId/cancel", ctrl.cancel)
router.post("/requests/:requestId/room-check", ctrl.roomCheck)
router.post("/requests/:requestId/assign", ctrl.assign)
router.post("/requests/:requestId/checkin", ctrl.checkIn)
router.post("/requests/:requestId/checkout", ctrl.checkOut)
router.post("/requests/:requestId/proof", upload, ctrl.upload)
router.post("/requests/:requestId/resend", ctrl.resend)
export default router
