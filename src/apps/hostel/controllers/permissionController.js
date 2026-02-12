/**
 * Backward-compatible re-exports for moved permission controllers.
 * Source of truth now lives in apps/iam/modules/permissions.
 */

export {
  getUserPermissions,
  updateUserPermissions,
  resetUserPermissions,
  getUsersByRole,
  initializeUserPermissions,
  resetRolePermissions,
  setRolePermissions,
} from '../../iam/modules/permissions/permissions.controller.js';

