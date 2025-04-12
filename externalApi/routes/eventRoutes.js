import express from "express"
import { searchEvents } from "../controllers/eventApi.js"

const router = express.Router()

router.route("/search").get(searchEvents)

export default router
