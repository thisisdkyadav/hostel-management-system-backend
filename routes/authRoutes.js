import express from "express"
import { loginWithGoogle, logout, getUser, login, updatePassword, verifySSOToken } from "../controllers/authController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.get("/user", authenticate, getUser)
router.get("/logout", authenticate, logout)
router.post("/google", loginWithGoogle)
router.post("/login", login)
router.post("/update-password", authenticate, updatePassword)
router.post("/verify-sso-token", verifySSOToken)

export default router
