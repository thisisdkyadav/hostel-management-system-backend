/**
 * Transaction Helper
 * Provides utilities for MongoDB transactions
 * 
 * @module services/base/TransactionHelper
 */

import mongoose from 'mongoose';
import { error } from './ServiceResponse.js';

/**
 * Execute callback within a MongoDB transaction
 * Handles session creation, commit, rollback, and cleanup
 * 
 * @param {Function} callback - Async function receiving session
 * @returns {Promise<any>} Result from callback
 * 
 * @example
 * const result = await withTransaction(async (session) => {
 *   await User.create([userData], { session });
 *   await Profile.create([profileData], { session });
 *   return { user, profile };
 * });
 */
export async function withTransaction(callback) {
  const session = await mongoose.startSession();
  
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } catch (err) {
    console.error('Transaction failed:', err.message);
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Execute callback within transaction and return ServiceResponse
 * Catches errors and returns proper error response
 * 
 * @param {Function} callback - Async function receiving session
 * @param {string} errorMessage - Message to return on failure
 * @returns {Promise<ServiceResponse>}
 */
export async function withTransactionResponse(callback, errorMessage = 'Operation failed') {
  try {
    return await withTransaction(callback);
  } catch (err) {
    return error(errorMessage, 500, err.message);
  }
}

export default { withTransaction, withTransactionResponse };
