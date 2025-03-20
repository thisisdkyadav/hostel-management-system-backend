import express from "express"
import { addHostel, getHostels, getHostelList } from "../controllers/hostelController.js"
import { createWarden, getAllWardens, updateWarden, deleteWarden, createSecurity, getAllSecurities, updateSecurity } from "../controllers/adminController.js"
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
router.get("/hostel/list", getHostelList)

router.get("/wardens", getAllWardens)
router.post("/warden/add", createWarden)
router.post("/warden/update/:id", updateWarden)
router.delete("/warden/delete/:id", deleteWarden)

router.post("/security/add", createSecurity)
router.get("/security", getAllSecurities)
router.post("/security/update/:id", updateSecurity)

export default router
