/**
 * LEGACY FILE - Re-exports from new location
 * TODO: Update all imports to use '../src/middlewares' then delete this file
 * @see src/middlewares/authorize.middleware.js
 */
export { authorizeRoles, isStudentManager, requirePermission } from "../src/middlewares/authorize.middleware.js"
