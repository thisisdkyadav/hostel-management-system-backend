import express from "express"
import { addHostel, getHostels } from "../controllers/hostelControllers.js"
import {
  authenticate,
  // ,
  // authorizeAdmin
} from "../middlewares/auth.js"
// import { validateUserUpdate } from "../middlewares/validation.js"

const router = express.Router()
// Middleware to authenticate and authorize admin
router.use(authenticate)
// router.use(authorizeAdmin)

router.get("/hostels", getHostels)
router.post("/hostel/add", addHostel)

export default router
