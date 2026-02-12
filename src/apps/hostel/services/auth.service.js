/**
 * Backward-compatible re-exports for moved auth service.
 * Source of truth now lives in apps/auth/modules/auth.
 */

export {
  authService,
  getDeviceNameFromUserAgent,
  sessionExistsInStore,
} from '../../auth/modules/auth/auth.service.js';
export { default as AuthService } from '../../auth/modules/auth/auth.service.js';
export { default } from '../../auth/modules/auth/auth.service.js';

