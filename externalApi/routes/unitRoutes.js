import express from "express"
import { searchUnits } from "../controllers/unitApi.js"

const router = express.Router()

router.route("/search").get(searchUnits)

export default router
