import express from "express"
import { searchSecurity } from "../controllers/securityApi.js"

const router = express.Router()

router.route("/search").get(searchSecurity)

export default router
