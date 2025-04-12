import express from "express"
import { searchLostAndFound } from "../controllers/lostAndFoundApi.js"

const router = express.Router()

router.route("/search").get(searchLostAndFound)

export default router
