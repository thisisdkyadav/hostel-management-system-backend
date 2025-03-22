import express from "express"
import { loginWithGoogle, logout, getUser, login } from "../controllers/authController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.get("/user", authenticate, getUser)
router.get("/logout", authenticate, logout)
router.post("/google", loginWithGoogle)
router.post("/login", login)

export default router
