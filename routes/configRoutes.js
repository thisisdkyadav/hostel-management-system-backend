import express from "express"
import { getConfigurationByKey, updateConfiguration, resetConfigurationToDefault } from "../controllers/configController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Admin"]))

router.get("/:key", getConfigurationByKey)

router.put("/:key", updateConfiguration)

router.post("/:key/reset", resetConfigurationToDefault)

export default router
