import express from "express"
import { searchStudentProfiles } from "../controllers/studentProfileApi.js"

const router = express.Router()

router.get("/search", searchStudentProfiles)

export default router
