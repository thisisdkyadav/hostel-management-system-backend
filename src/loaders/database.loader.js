/**
 * Database Loader
 * Initializes MongoDB connection
 */

import { connectDatabase } from '../config/database.config.js';

/**
 * Initialize database connection
 * @returns {Promise<void>}
 */
export const initializeDatabase = async () => {
  console.log('Connecting to MongoDB...');
  await connectDatabase();
  console.log('MongoDB connected successfully');
};

export default initializeDatabase;
