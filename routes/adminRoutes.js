import express from "express"
import { addHostel, getHostels, getHostelList } from "../controllers/hostelController.js"
import { createWarden, getAllWardens, updateWarden, deleteWarden, createSecurity, getAllSecurities, updateSecurity, updateUserPassword, deleteSecurity } from "../controllers/adminController.js"
import {
  authenticate,
  // ,
  // authorizeAdmin
} from "../middlewares/auth.js"
// import { validateUserUpdate } from "../middlewares/validation.js"

const router = express.Router()
router.use(authenticate)
// router.use(authorizeAdmin)

router.get("/hostels", getHostels)

router.post("/hostel", addHostel)
router.get("/hostel/list", getHostelList)

router.get("/wardens", getAllWardens)
router.post("/warden", createWarden)
router.put("/warden/:id", updateWarden)
router.delete("/warden/:id", deleteWarden)

router.get("/security", getAllSecurities)
router.post("/security", createSecurity)
router.put("/security/:id", updateSecurity)
router.delete("/security/:id", deleteSecurity)

router.post("/user/update-password", updateUserPassword)

export default router
