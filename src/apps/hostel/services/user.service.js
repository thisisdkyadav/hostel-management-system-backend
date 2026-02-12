/**
 * Backward-compatible re-exports for moved user service.
 * Source of truth now lives in apps/iam/modules/users.
 */

export { userService } from '../../iam/modules/users/users.service.js';
export { default as UserService } from '../../iam/modules/users/users.service.js';
export { default } from '../../iam/modules/users/users.service.js';

