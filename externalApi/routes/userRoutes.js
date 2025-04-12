import express from "express"
import { searchUsers } from "../controllers/userApi.js"

const router = express.Router()

router.get("/search", searchUsers)

export default router
