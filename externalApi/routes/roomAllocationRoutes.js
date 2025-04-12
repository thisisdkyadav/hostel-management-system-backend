import express from "express"
import { searchAllocations } from "../controllers/roomAllocationApi.js"

const router = express.Router()

router.route("/search").get(searchAllocations)

export default router
