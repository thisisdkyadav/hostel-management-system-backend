# Environment Configuration (`/config/environment.js`)

This file is responsible for loading and exporting environment variables used throughout the application.

## Dependencies

- `dotenv`: Used to load environment variables from a `.env` file into `process.env`.

## Functionality

1.  **Loads `.env`:** Calls `dotenv.config()` to load variables from a `.env` file located in the project root.
2.  **Exports Variables:** Exports various configuration variables fetched from `process.env`. It provides default values for some (like `PORT`).

## Exported Variables

- `isDevelopmentEnvironment` (Boolean): True if `process.env.NODE_ENV` is set to "development", false otherwise. Used for environment-specific logic (e.g., cookie security settings in [`middlewares/auth.js`](../middlewares/auth.md) and [`controllers/authController.js`](../controllers/authController.md)).
- `PORT` (Number): The port number for the server to listen on. Defaults to 5000 if `process.env.PORT` is not set. Used in [`server.js`](../server.md).
- `JWT_SECRET` (String): The secret key used for signing and verifying JSON Web Tokens (JWTs) in [`middlewares/auth.js`](../middlewares/auth.md) and [`controllers/authController.js`](../controllers/authController.md).
- `MONGO_URI` (String): The connection string for the MongoDB database, used in [`config/db.js`](db.md).
- `AZURE_STORAGE_CONNECTION_STRING` (String): Connection string for Azure Blob Storage, used in [`controllers/uploadController.js`](../controllers/uploadController.md).
- `AZURE_STORAGE_CONTAINER_NAME` (String): Name of the Azure Blob Storage container used for uploads in [`controllers/uploadController.js`](../controllers/uploadController.md).
- `AZURE_STORAGE_ACCOUNT_NAME` (String): Account name for Azure Blob Storage, used in [`controllers/uploadController.js`](../controllers/uploadController.md).
- `AZURE_STORAGE_ACCOUNT_KEY` (String): Account key for Azure Blob Storage, used in [`controllers/uploadController.js`](../controllers/uploadController.md).
- `QR_PRIVATE_KEY` (String): Secret key used in conjunction with QR code generation/verification in [`utils/qrUtils.js`](../utils/qrUtils.md).
- `RAZORPAY_KEY_ID` (String): Razorpay API Key ID, used in [`controllers/paymentController.js`](../controllers/paymentController.md).
- `RAZORPAY_KEY_SECRET` (String): Razorpay API Key Secret, used in [`controllers/paymentController.js`](../controllers/paymentController.md).

## `.env` File Example

See [`.env` Documentation](dotenv.md) for details and an example.
