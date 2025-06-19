import express from "express"
import { redirect, verifySSOToken } from "../controllers/ssoController.js"

const router = express.Router()

router.get("/redirect", redirect)
router.post("/verify", verifySSOToken)

export default router
