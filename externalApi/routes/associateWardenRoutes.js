import express from "express"
import { searchAssociateWardens } from "../controllers/associateWardenApi.js"

const router = express.Router()

router.route("/search").get(searchAssociateWardens)

export default router
