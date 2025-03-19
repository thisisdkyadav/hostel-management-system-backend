import express from "express"
import { loginWithGoogle, logout, getUser } from "../controllers/authController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.post("/google", loginWithGoogle)
router.get("/logout", logout)

router.get("/user", authenticate, getUser)

export default router
