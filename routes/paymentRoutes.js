import express from "express"
import { createPaymentLink, checkPaymentStatus } from "../controllers/paymentController.js"

const router = express.Router()

router.post("/create-link", createPaymentLink)
router.get("/status/:paymentLinkId", checkPaymentStatus)

export default router
