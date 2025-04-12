import express from "express"
import { searchHostels } from "../controllers/hostelApi.js"

const router = express.Router()

router.route("/search").get(searchHostels)

export default router
