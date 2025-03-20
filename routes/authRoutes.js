import express from "express"
import { loginWithGoogle, logout, getUser, login } from "../controllers/authController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.post("/google", loginWithGoogle)
router.get("/logout", logout)
router.post("/login", login)

router.get("/user", authenticate, getUser)

export default router
