/**
 * Backward-compatible re-exports for moved SSO controllers.
 * Source of truth now lives in apps/auth/modules/sso.
 */

export { redirect, verifySSOToken } from '../../auth/modules/sso/sso.controller.js';

