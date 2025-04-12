# Hostel Management System API Documentation

This documentation provides an overview and detailed explanation of the Hostel Management System's backend API.

## Table of Contents

- [**Main Index**](index.md): Comprehensive overview and navigation for all documentation.
- [**Environment Variables (.env)**](dotenv.md): How to set up the required environment variables.
- [**Server Setup (server.js)**](server.md): Details about the main application entry point.

### Core Components

- **Configuration**
  - [Environment Configuration (`config/environment.js`)](config/environment.md)
  - [Database Connection (`config/db.js`)](config/db.md)
- **Middleware**
  - [Authentication (`middlewares/auth.js`)](middlewares/auth.md)
  - [Authorization (`middlewares/authorize.js`)](middlewares/authorize.md)
- **Utilities**
  - [General Utilities (`utils/utils.js`)](utils/utils.md)
  - [QR Code Utilities (`utils/qrUtils.js`)](utils/qrUtils.md)
- [**Models**](models/README.md): Documentation for Mongoose models.
- [**Main API Controllers**](controllers/README.md): Documentation for main application controllers.
- [**Main API Routes**](routes/README.md): Documentation for main application routes.

### API Documentation

- [**External API**](externalApi/index.md): Documentation for the external-facing API endpoints.
  - [Middleware (`apiAuth.md`)](externalApi/middleware/apiAuth.md)
  - [Controllers (`README.md`)](externalApi/controllers/README.md)
  - [Routes (`README.md`)](externalApi/routes/README.md) (Links route files to controller docs)
