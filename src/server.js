/**
 * Server Entry Point (New Structure)
 * Simplified entry point that uses loaders for initialization
 */

import { createApp } from './app.js';
import { initializeDatabase, initializeSocketIO, closeSocketIO } from './loaders/index.js';
import env from './config/env.config.js';

const PORT = env.PORT || 5000;

/**
 * Start the server
 */
const startServer = async () => {
  try {
    // 1. Connect to database
    await initializeDatabase();

    // 2. Create Express app
    const { app, sessionMiddleware } = createApp();

    // 3. Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📍 Environment: ${env.NODE_ENV}`);
    });

    // 4. Initialize Socket.IO
    initializeSocketIO(server, sessionMiddleware);
    console.log('🔌 Socket.IO initialized');

    // 5. Setup graceful shutdown
    const gracefulShutdown = async (signal) => {
      console.log(`\n📡 Received ${signal}. Starting graceful shutdown...`);
      
      // Close Socket.IO connections
      await closeSocketIO();
      
      // Close HTTP server
      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        console.error('⚠️ Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
