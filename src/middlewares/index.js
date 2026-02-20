// Auth middlewares
export { authenticate, refreshUserData, ensureSession } from "./auth.middleware.js"

// Authorization middlewares
export { authorizeRoles, isStudentManager } from "./authorize.middleware.js"
export {
  requireRouteAccess,
  requireCapability,
  requireAnyCapability,
  requireAllCapabilities,
} from "./authz.middleware.js"

// Face scanner auth
export { authenticateScanner } from "./faceScannerAuth.middleware.js"

// Validation
export { validate, validateBody, validateQuery, validateParams } from "./validate.middleware.js"
