# Hostel Management System - Backend

A comprehensive backend for managing hostel operations including student management, room allocation, visitor tracking, leave management, complaints, and more.

## 🏗️ Project Structure

```
backend/
├── src/                          # New modular source code
│   ├── app.js                    # Express app factory
│   ├── server.js                 # Entry point
│   ├── config/                   # Configuration modules
│   │   ├── index.js              # Config exports
│   │   ├── env.config.js         # Environment variables
│   │   ├── database.config.js    # MongoDB configuration
│   │   ├── cors.config.js        # CORS settings
│   │   └── session.config.js     # Session configuration
│   ├── loaders/                  # Initialization loaders
│   │   ├── index.js              # Loader exports
│   │   ├── database.loader.js    # MongoDB connection
│   │   ├── express.loader.js     # Express middleware & routes
│   │   └── socket.loader.js      # Socket.IO with Redis
│   ├── middlewares/              # Express middlewares
│   │   ├── auth.middleware.js    # JWT/Session authentication
│   │   ├── authorize.middleware.js # Role-based access control
│   │   └── faceScannerAuth.middleware.js
│   ├── models/                   # Mongoose models (organized by domain)
│   │   ├── index.js              # Model exports
│   │   ├── user/                 # User-related models
│   │   ├── hostel/               # Hostel & room models
│   │   ├── student/              # Student models
│   │   ├── complaint/            # Complaint models
│   │   ├── visitor/              # Visitor models
│   │   └── ...                   # Other domain models
│   ├── routes/                   # API routes
│   │   └── v1/                   # Version 1 API
│   │       ├── index.js          # Route aggregator
│   │       └── *.routes.js       # Individual route files
│   ├── services/                 # Business logic services
│   │   ├── index.js              # Service exports
│   │   ├── storage.service.js    # Azure/local file storage
│   │   ├── notification.service.js
│   │   └── payment.service.js
│   ├── external/                 # External API for third parties
│   │   ├── index.js              # External API router
│   │   ├── middleware/           # API key authentication
│   │   ├── controllers/          # External API controllers
│   │   └── routes/               # External API routes
│   └── utils/                    # Utility functions
│       ├── index.js              # Utility exports
│       ├── asyncHandler.js       # Async error wrapper
│       ├── response.utils.js     # Standardized responses
│       └── ...
├── controllers/                  # Legacy controllers (re-exports)
├── routes/                       # Legacy routes (re-exports)
├── models/                       # Legacy models (re-exports)
├── middlewares/                  # Legacy middlewares (re-exports)
├── config/                       # Legacy config (re-exports)
├── services/                     # Legacy services (re-exports)
├── utils/                        # Legacy utils (re-exports)
├── externalApi/                  # Legacy external API (re-exports)
├── uploads/                      # Local file uploads
├── logs/                         # Application logs
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
├── server.js                     # Legacy entry point (uses new structure)
├── legacy_remain.md              # Tracks backward compatibility code
└── restructure_plan.md           # Migration plan
```

## 🚀 Getting Started

### Prerequisites

- Node.js v18+ (tested with v24.13.0)
- MongoDB 5.0+
- Redis (optional, for Socket.IO scaling)

### Installation

```bash
# Clone the repository
git clone https://github.com/thisisdkyadav/hostel-management-system-backend.git
cd hostel-management-system-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

### Environment Variables

```env
# Server
NODE_ENV=development
PORT=5000

# Database
MONGO_URI=mongodb://localhost:27017/hms

# Auth
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret

# Redis (optional)
REDIS_URL=redis://localhost:6379

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Azure Storage (optional)
AZURE_STORAGE_CONNECTION_STRING=
AZURE_STORAGE_CONTAINER_NAME=
AZURE_STORAGE_ACCOUNT_NAME=
AZURE_STORAGE_ACCOUNT_KEY=

# Local Storage (alternative to Azure)
USE_LOCAL_STORAGE=true

# Razorpay (optional)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

### Running the Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start

# Legacy mode (uses old server.js)
npm run dev:legacy
```

## 📡 API Overview

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Current user info

### Students
- `GET /api/student` - List students
- `POST /api/student` - Create student
- `GET /api/student/:id` - Get student details

### Hostels
- `GET /api/hostel` - List hostels
- `POST /api/hostel` - Create hostel
- `GET /api/hostel/:id/rooms` - Get hostel rooms

### Complaints
- `GET /api/complaint` - List complaints
- `POST /api/complaint` - Submit complaint
- `PATCH /api/complaint/:id/status` - Update status

### Visitors
- `GET /api/visitor` - List visitors
- `POST /api/visitor` - Register visitor
- `PATCH /api/visitor/:id/checkout` - Checkout visitor

### Leave Management
- `GET /api/leave` - List leave requests
- `POST /api/leave` - Apply for leave
- `PATCH /api/leave/:id/approve` - Approve leave

### And many more...
See [docs/](docs/) for complete API documentation.

## 🔌 WebSocket Events

Real-time features powered by Socket.IO:

- `notification` - Real-time notifications
- `visitor-update` - Visitor check-in/out updates
- `complaint-update` - Complaint status changes
- `online-users` - Active user tracking

## 🔐 External API

Third-party integration via API key authentication:

```
Base URL: /external-api
Header: x-api-key: <your-api-key>
```

See [src/external/README.md](src/external/README.md) for details.

## 🧪 Testing

```bash
# Run tests (when available)
npm test
```

## 📦 Tech Stack

- **Runtime**: Node.js v24
- **Framework**: Express.js 4.21
- **Database**: MongoDB with Mongoose 8.10
- **Session Store**: connect-mongo
- **Real-time**: Socket.IO 4.8 with Redis adapter
- **File Storage**: Azure Blob Storage / Local
- **Payments**: Razorpay

## 🔄 Migration Notes

This project underwent a major restructuring from a flat structure to a modular architecture. Key changes:

1. **New `src/` directory** - All new code lives here
2. **Versioned routes** - `/api/*` routes are now in `src/routes/v1/`
3. **Organized models** - Models grouped by domain
4. **Loader pattern** - Modular server initialization
5. **Backward compatibility** - Old imports still work via re-exports

See [restructure_plan.md](restructure_plan.md) for the complete migration plan.

### For Developers

- New code should import from `src/` paths
- Legacy paths work but are deprecated
- Check [legacy_remain.md](legacy_remain.md) for tracked compatibility code

## 📄 License

This project is licensed under the ISC License.

## 👥 Contributors

- Devesh Kumar Yadav ([@thisisdkyadav](https://github.com/thisisdkyadav))
