/**
 * Password Reset Token Model
 * Stores temporary tokens for password reset functionality
 */

import mongoose from 'mongoose';

const PasswordResetTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    used: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Index for auto-cleanup of expired tokens (MongoDB TTL index)
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for faster lookups
PasswordResetTokenSchema.index({ userId: 1 });

/**
 * Check if token is valid (not used and not expired)
 */
PasswordResetTokenSchema.methods.isValid = function () {
  return !this.used && this.expiresAt > new Date();
};

/**
 * Mark token as used
 */
PasswordResetTokenSchema.methods.markAsUsed = async function () {
  this.used = true;
  return this.save();
};

/**
 * Find valid token
 */
PasswordResetTokenSchema.statics.findValidToken = async function (token) {
  return this.findOne({
    token,
    used: false,
    expiresAt: { $gt: new Date() },
  }).populate('userId', 'name email');
};

/**
 * Invalidate all tokens for a user
 */
PasswordResetTokenSchema.statics.invalidateUserTokens = async function (userId) {
  return this.updateMany(
    { userId, used: false },
    { $set: { used: true } }
  );
};

const PasswordResetToken = mongoose.model('PasswordResetToken', PasswordResetTokenSchema);

export default PasswordResetToken;
