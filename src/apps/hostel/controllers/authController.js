/**
 * Backward-compatible re-exports for moved auth controllers.
 * Source of truth now lives in apps/auth/modules/auth.
 */

export {
  loginWithGoogle,
  logout,
  getUser,
  login,
  updatePassword,
  verifySSOToken,
  getUserDevices,
  logoutDevice,
  forgotPassword,
  verifyResetToken,
  resetPassword,
} from '../../auth/modules/auth/auth.controller.js';

