/**
 * Signature Routes
 * Base path: /api/v1/signature
 *
 * Self-service for every authenticated user; the directory is admin-only and powers
 * the certificate signatory picker.
 */

import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import * as controller from "./signature.controller.js"

const router = express.Router()

router.use(authenticate)

// Admin directory of users with a usable signature (for the signatory picker)
router.get("/directory", authorizeRoles(["Admin"]), controller.listSignatories)

// Current user's own signature
router.get("/", controller.getMySignature)
router.put("/", controller.updateMySignature)
router.delete("/", controller.deleteMySignature)

export default router
