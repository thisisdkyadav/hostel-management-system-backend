import express from "express"
import { searchRooms } from "../controllers/roomApi.js"

const router = express.Router()

router.route("/search").get(searchRooms)

export default router
