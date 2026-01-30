/**
 * Express App Loader
 * Configures Express middleware and routes
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuration
import env from '../config/env.config.js';

// Error Handlers
import { errorHandler, notFoundHandler } from '../core/errors/errorHandler.js';

// Controllers for special routes
import { verifySSOToken } from '../controllers/ssoController.js';

// All route imports (using new organized paths)
import authRoutes from '../routes/v1/auth.routes.js';
import wardenRoutes from '../routes/v1/warden.routes.js';
import studentRoutes from '../routes/v1/student.routes.js';
import adminRoutes from '../routes/v1/admin.routes.js';
import complaintRoutes from '../routes/v1/complaint.routes.js';
import LostAndFoundRoutes from '../routes/v1/lostAndFound.routes.js';
import securityRoutes from '../routes/v1/security.routes.js';
import eventRoutes from '../routes/v1/event.routes.js';
import hostelRoutes from '../routes/v1/hostel.routes.js';
import statsRoutes from '../routes/v1/stats.routes.js';
import feedbackRoutes from '../routes/v1/feedback.routes.js';
import uploadRoutes from '../routes/v1/upload.routes.js';
import visitorRoutes from '../routes/v1/visitor.routes.js';
import notificationRoutes from '../routes/v1/notification.routes.js';
import disCoRoutes from '../routes/v1/disco.routes.js';
import certificateRoutes from '../routes/v1/certificate.routes.js';
import paymentRoutes from '../routes/v1/payment.routes.js';
import superAdminRoutes from '../routes/v1/superAdmin.routes.js';
import familyMemberRoutes from '../routes/v1/familyMember.routes.js';
import staffAttendanceRoutes from '../routes/v1/staffAttendance.routes.js';
import inventoryRoutes from '../routes/v1/inventory.routes.js';
import permissionRoutes from '../routes/v1/permission.routes.js';
import taskRoutes from '../routes/v1/task.routes.js';
import userRoutes from '../routes/v1/user.routes.js';
import undertakingRoutes from '../routes/v1/undertaking.routes.js';
import onlineUsersRoutes from '../routes/v1/onlineUsers.routes.js';
import liveCheckInOutRoutes from '../routes/v1/liveCheckInOut.routes.js';
import faceScannerRoutes from '../routes/v1/faceScanner.routes.js';
import sheetRoutes from '../routes/v1/sheet.routes.js';
import dashboardRoutes from '../routes/v1/dashboard.routes.js';
import configRoutes from '../routes/v1/config.routes.js';
import studentProfileRoutes from '../routes/v1/studentProfile.routes.js';
import ssoRoutes from '../routes/v1/sso.routes.js';
import leaveRoutes from '../routes/v1/leave.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CORS Configuration Options
 */
const ssoCorsOptions = {
  origin: '*',
  credentials: false,
};

const scannerCorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const regularCorsOptions = {
  origin: env.ALLOWED_ORIGINS, // Already an array from env.config.js
  credentials: true,
};

/**
 * Create session middleware
 * @returns {Function} Session middleware
 */
export const createSessionMiddleware = () => {
  const isDevelopment = env.NODE_ENV === 'development';
  
  return session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: env.MONGO_URI,
      ttl: 7 * 24 * 60 * 60, // 7 days
      autoRemove: 'native',
      touchAfter: 24 * 3600, // 24 hours
      crypto: {
        secret: env.SESSION_SECRET,
      },
    }),
    cookie: {
      httpOnly: true,
      secure: !isDevelopment,
      sameSite: !isDevelopment ? 'None' : 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });
};

/**
 * Initialize Express application
 * @param {Express} app - Express application instance
 * @returns {Object} Object containing app and sessionMiddleware
 */
export const initializeExpress = (app) => {
  // Trust proxy for secure cookies behind load balancer
  app.set('trust proxy', 1);

  // Request parsing (before routes)
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  app.use(cookieParser());

  // ============================================
  // Special CORS Routes (before session/regular CORS)
  // ============================================
  
  // SSO verify route with special CORS
  app.use('/api/sso/verify', cors(ssoCorsOptions), express.json(), verifySSOToken);

  // Scanner routes with special CORS
  app.use('/api/face-scanner/ping', cors(scannerCorsOptions));
  app.use('/api/face-scanner/scan', cors(scannerCorsOptions));
  app.use('/api/face-scanner/test-auth', cors(scannerCorsOptions));

  // ============================================
  // Regular CORS
  // ============================================
  app.use(cors(regularCorsOptions));

  // ============================================
  // Session Middleware
  // ============================================
  const sessionMiddleware = createSessionMiddleware();
  app.use(sessionMiddleware);

  // ============================================
  // Static Files
  // ============================================
  if (env.USE_LOCAL_STORAGE) {
    app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
  }

  // Upload routes (before JSON parser for multipart)
  app.use('/api/upload', uploadRoutes);

  // JSON parser for remaining routes
  app.use(express.json({ limit: '1mb' }));

  // ============================================
  // API Routes
  // ============================================
  
  // Authentication
  app.use('/api/auth', authRoutes);
  app.use('/api/sso', ssoRoutes);
  
  // User management
  app.use('/api/warden', wardenRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/security', securityRoutes);
  app.use('/api/super-admin', superAdminRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/permissions', permissionRoutes);
  
  // Student
  app.use('/api/student', studentRoutes);
  app.use('/api/student-profile', studentProfileRoutes);
  app.use('/api/family', familyMemberRoutes);
  
  // Hostel
  app.use('/api/hostel', hostelRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  
  // Complaints
  app.use('/api/complaint', complaintRoutes);
  
  // Events & Lost and Found
  app.use('/api/event', eventRoutes);
  app.use('/api/lost-and-found', LostAndFoundRoutes);
  
  // Visitor
  app.use('/api/visitor', visitorRoutes);
  
  // Feedback
  app.use('/api/feedback', feedbackRoutes);
  
  // Notifications
  app.use('/api/notification', notificationRoutes);
  
  // Certificates & DisCo
  app.use('/api/certificate', certificateRoutes);
  app.use('/api/disCo', disCoRoutes);
  app.use('/api/undertaking', undertakingRoutes);
  
  // Inventory
  app.use('/api/inventory', inventoryRoutes);
  
  // Attendance & Leave
  app.use('/api/staff', staffAttendanceRoutes);
  app.use('/api/leave', leaveRoutes);
  app.use('/api/live-checkinout', liveCheckInOutRoutes);
  
  // Tasks
  app.use('/api/tasks', taskRoutes);
  
  // Payment
  app.use('/api/payment', paymentRoutes);
  
  // Configuration
  app.use('/api/config', configRoutes);
  
  // Statistics & Reporting
  app.use('/api/stats', statsRoutes);
  app.use('/api/online-users', onlineUsersRoutes);
  app.use('/api/sheet', sheetRoutes);
  
  // Face Scanner
  app.use('/api/face-scanner', faceScannerRoutes);

  // ============================================
  // Health Check / Root
  // ============================================
  app.get('/', (req, res) => {
    res.send('Hello World!!');
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ============================================
  // Error Handling (must be LAST)
  // ============================================
  
  // 404 handler for undefined routes
  app.use(notFoundHandler);
  
  // Global error handler
  app.use(errorHandler);

  return { app, sessionMiddleware };
};

export default initializeExpress;
