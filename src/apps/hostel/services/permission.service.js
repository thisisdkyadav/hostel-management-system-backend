/**
 * Backward-compatible re-exports for moved permission service.
 * Source of truth now lives in apps/iam/modules/permissions.
 */

export { permissionService } from '../../iam/modules/permissions/permissions.service.js';
export { default as PermissionService } from '../../iam/modules/permissions/permissions.service.js';
export { default } from '../../iam/modules/permissions/permissions.service.js';

