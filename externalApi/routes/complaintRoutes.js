import express from "express"
import { searchComplaints } from "../controllers/complaintApi.js"

const router = express.Router()

router.route("/search").get(searchComplaints)

export default router
