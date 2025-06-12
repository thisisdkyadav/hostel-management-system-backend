import express from "express"
import multer from "multer"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticate } from "../middlewares/auth.js"
import { uploadProfileImage } from "../controllers/uploadController.js"

const uploadRouter = express.Router()
uploadRouter.use(authenticate)

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

uploadRouter.use(authorizeRoles(["Admin"]))

uploadRouter.post("/profile/:userId", authorizeRoles(["Admin", "Warden"]), upload.single("image"), uploadProfileImage)

export default uploadRouter
