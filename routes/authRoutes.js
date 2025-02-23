import express from "express"
import { loginWithGoogle, logout } from "../controllers/authController.js"

const router = express.Router()

router.post("/google", loginWithGoogle)
router.get("/logout", logout)

export default router
