/**
 * Application Entry Point
 * Creates and configures the Express application
 */

import express from 'express';
import { initializeExpress } from './loaders/express.loader.js';

/**
 * Create and configure Express application
 * @returns {Object} Object containing app and sessionMiddleware
 */
export const createApp = () => {
  const app = express();
  return initializeExpress(app);
};

export default createApp;
