import express from "express"
import { searchDisCoActions } from "../controllers/discoActionApi.js"

const router = express.Router()

router.route("/search").get(searchDisCoActions)

export default router
