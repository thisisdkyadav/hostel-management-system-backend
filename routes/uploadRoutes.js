import express from "express"
import multer from "multer"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticate } from "../middlewares/auth.js"
import { uploadProfileImage, uploadStudentIdCard, h2FormPDF, uploadPaymentScreenshot, uploadLostAndFoundImage } from "../controllers/uploadController.js"

const uploadRouter = express.Router()
uploadRouter.use(authenticate)

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

uploadRouter.post("/profile/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Student"]), upload.single("image"), uploadProfileImage)
uploadRouter.post("/student-id/:side", authorizeRoles(["Student"]), upload.single("image"), uploadStudentIdCard)
uploadRouter.post("/h2-form", authorizeRoles(["Student"]), upload.any(), h2FormPDF)
uploadRouter.post("/payment-screenshot", authorizeRoles(["Student"]), upload.single("image"), uploadPaymentScreenshot)
uploadRouter.post("/lost-and-found-image", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), upload.single("image"), uploadLostAndFoundImage)
export default uploadRouter
