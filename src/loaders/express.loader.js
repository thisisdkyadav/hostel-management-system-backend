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

// Controllers for special routes
import { verifySSOToken } from '../../controllers/ssoController.js';

// All route imports (using legacy paths for backward compatibility)
import authRoutes from '../../routes/authRoutes.js';
import wardenRoutes from '../../routes/wardenRoute.js';
import studentRoutes from '../../routes/studentRoutes.js';
import adminRoutes from '../../routes/adminRoutes.js';
import complaintRoutes from '../../routes/complaintRoutes.js';
import LostAndFoundRoutes from '../../routes/lostAndFoundRoutes.js';
import securityRoutes from '../../routes/securityRoutes.js';
import eventRoutes from '../../routes/eventRoutes.js';
import hostelRoutes from '../../routes/hostelRoutes.js';
import statsRoutes from '../../routes/statsRoutes.js';
import feedbackRoutes from '../../routes/feedbackRoutes.js';
import uploadRoutes from '../../routes/uploadRoutes.js';
import visitorRoutes from '../../routes/visitorRoutes.js';
import notificationRoutes from '../../routes/notificationRoutes.js';
import disCoRoutes from '../../routes/disCoRoutes.js';
import certificateRoutes from '../../routes/certificateRoutes.js';
import paymentRoutes from '../../routes/paymentRoutes.js';
import superAdminRoutes from '../../routes/superAdminRoutes.js';
import familyMemberRoutes from '../../routes/familyMemberRoutes.js';
import staffAttendanceRoutes from '../../routes/staffAttendanceRoutes.js';
import inventoryRoutes from '../../routes/inventoryRoutes.js';
import permissionRoutes from '../../routes/permissionRoutes.js';
import taskRoutes from '../../routes/taskRoutes.js';
import userRoutes from '../../routes/userRoutes.js';
import undertakingRoutes from '../../routes/undertakingRoutes.js';
import onlineUsersRoutes from '../../routes/onlineUsersRoutes.js';
import liveCheckInOutRoutes from '../../routes/liveCheckInOutRoutes.js';
import faceScannerRoutes from '../../routes/faceScannerRoutes.js';
import sheetRoutes from '../../routes/sheetRoutes.js';
import dashboardRoutes from '../../routes/dashboardRoutes.js';
import configRoutes from '../../routes/configRoutes.js';
import studentProfileRoutes from '../../routes/studentProfileRoutes.js';
import ssoRoutes from '../../routes/ssoRoutes.js';
import leaveRoutes from '../../routes/leaveRoutes.js';

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

  return { app, sessionMiddleware };
};

export default initializeExpress;
