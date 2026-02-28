import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User, PasswordResetToken } from '../../../../models/index.js';
import { emailService } from '../../../../services/email/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';
import { success, badRequest, notFound, unauthorized } from '../../../../services/base/index.js';
import { findUserByEmail, PASSWORD_RESET_GENERIC_MESSAGE } from './auth.shared.js';

export const updatePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password').exec();

  if (!user) {
    return sendStandardResponse(res, notFound('User'));
  }

  if (!user.password) {
    return sendStandardResponse(res, unauthorized('No password is currently set for this account'));
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    return sendStandardResponse(res, unauthorized('Old password is incorrect'));
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);
  user.password = hashedPassword;
  await user.save();

  return sendStandardResponse(res, success(null, 200, 'Password updated successfully'));
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await findUserByEmail(email);

  if (!user) {
    return sendStandardResponse(
      res,
      success(null, 200, PASSWORD_RESET_GENERIC_MESSAGE)
    );
  }

  await PasswordResetToken.invalidateUserTokens(user._id);

  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

  await PasswordResetToken.create({
    userId: user._id,
    token: hashedToken,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);

  return sendStandardResponse(
    res,
    success(null, 200, PASSWORD_RESET_GENERIC_MESSAGE)
  );
});

export const verifyResetToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const resetToken = await PasswordResetToken.findValidToken(hashedToken);

  if (!resetToken) {
    return sendStandardResponse(res, badRequest('Invalid or expired reset token'));
  }

  return sendStandardResponse(
    res,
    success(
      {
        user: {
          _id: resetToken.userId._id,
          name: resetToken.userId.name,
          email: resetToken.userId.email,
        },
      },
      200,
      'Token is valid'
    )
  );
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const resetToken = await PasswordResetToken.findValidToken(hashedToken);

  if (!resetToken) {
    return sendStandardResponse(res, badRequest('Invalid or expired reset token'));
  }

  const user = await User.findById(resetToken.userId._id).exec();
  if (!user) {
    return sendStandardResponse(res, notFound('User'));
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  user.password = hashedPassword;
  await user.save();

  await resetToken.markAsUsed();
  await PasswordResetToken.invalidateUserTokens(user._id);
  await emailService.sendPasswordResetSuccessEmail(user.email, user.name);

  return sendStandardResponse(res, success(null, 200, 'Password has been reset successfully'));
});

export default {
  updatePassword,
  forgotPassword,
  verifyResetToken,
  resetPassword,
};
