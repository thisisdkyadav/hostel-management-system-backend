import express from "express"
import { searchVisitorRequests } from "../controllers/visitorRequestApi.js"

const router = express.Router()

router.route("/search").get(searchVisitorRequests)

export default router
