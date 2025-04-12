import express from "express"
import { searchWardens } from "../controllers/wardenApi.js"

const router = express.Router()

router.route("/search").get(searchWardens)

export default router
