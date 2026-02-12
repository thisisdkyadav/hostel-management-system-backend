/**
 * Backward-compatible re-exports for moved user controllers.
 * Source of truth now lives in apps/iam/modules/users.
 */

export {
  searchUsers,
  getUserById,
  getUsersByRole,
  bulkPasswordUpdate,
  removeUserPassword,
  bulkRemovePasswords,
  removePasswordsByRole,
} from '../../iam/modules/users/users.controller.js';

