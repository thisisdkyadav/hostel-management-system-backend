# Environment Variables (`/.env`)

This file stores environment-specific configuration variables for the application. **It should not be committed to version control (e.g., Git)** due to potentially sensitive information like API keys and database credentials.

A `.env.example` file should typically be created and committed to show the required variables without their actual values.

## Purpose

The variables defined in this file are loaded into `process.env` by the `dotenv` package when the application starts (specifically in `/config/environment.js`). This allows the application to behave differently in various environments (development, testing, production) and keeps sensitive keys separate from the codebase.

## Required Variables

The application relies on the following environment variables (refer to `docs/config/environment.md` for details on how they are used):

```env
# Application Environment & Server
NODE_ENV=development # or 'production'
PORT=5000

# Security
JWT_SECRET=your_jwt_secret_key_here
QR_PRIVATE_KEY=your_qr_encryption_key_here # Used for QR code encryption/decryption

# Database
MONGO_URI=mongodb://localhost:27017/hostel_management # Example local connection string

# Azure Storage (for file uploads)
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=youraccount;AccountKey=yourkey;EndpointSuffix=core.windows.net"
AZURE_STORAGE_CONTAINER_NAME=profileimages # Or your chosen container name
AZURE_STORAGE_ACCOUNT_NAME=youraccount
AZURE_STORAGE_ACCOUNT_KEY=yourkey

# Razorpay (for payments)
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxxxx # Use test keys for development
RAZORPAY_KEY_SECRET=your_razorpay_secret_key
```

**Note:** Ensure you replace the placeholder values (like `your_jwt_secret_key_here`, `youraccount`, `yourkey`, etc.) with your actual configuration values for each environment.
