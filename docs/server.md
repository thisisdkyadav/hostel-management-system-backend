# Server Entry Point (`/server.js`)

This file is the main entry point for the Node.js backend application using the Express framework.

## Dependencies

- `express`: Web application framework.
- `cors`: Middleware for enabling Cross-Origin Resource Sharing.
- `cookie-parser`: Middleware for parsing cookies attached to the client request object.
- [`./config/environment.js`](config/environment.md): Imports the `PORT` variable.
- [`./config/db.js`](config/db.md): Imports the `connectDB` function.
- All route files from [`./routes/`](controllers/README.md) (e.g., `authRoutes`, `studentRoutes`, etc.).
- [`./externalApi/index.js`](externalApi/index.md): Imports the main router for the external API.

## Functionality

1.  **Initialize Express App:** Creates an instance of the Express application.
2.  **Configure Middleware:**
    - `express.urlencoded()`: Parses URL-encoded request bodies (limit 1mb).
    - `cookieParser()`: Parses cookies and makes them available on `req.cookies`.
    - `app.set("trust proxy", 1)`: Indicates the app is behind a proxy (like Azure App Service, Vercel) and should trust the `X-Forwarded-*` headers for determining protocol, IP address etc. Important for secure cookies in production.
    - `cors()`: Enables CORS with specific allowed origins and allows credentials (cookies) to be sent from those origins.
    - `express.json()`: Parses JSON request bodies (limit 1mb). **Note:** This is applied _after_ the `/api/upload` route, implying uploads might not use JSON bodies, while other API routes do.
3.  **Mount Routes:**
    - Mounts `uploadRoutes` ([`controllers/uploadController.md`](controllers/uploadController.md)) under `/api/upload`.
    - Mounts standard API routes (auth, warden, student, admin, etc.) under `/api/...` prefixes. (See [API Controllers](controllers/README.md))
    - Mounts the entire external API router ([`externalApi/index.md`](externalApi/index.md)) under `/external-api`.
4.  **Root Endpoint:** Defines a simple `GET /` endpoint that responds with "Hello World!!" (likely for basic health checks or testing).
5.  **Start Server:**
    - Calls `app.listen()` to start the server on the specified `PORT` (from [`config/environment.md`](config/environment.md)) and listens on all available network interfaces (`"0.0.0.0"`).
    - Logs a confirmation message that the server is running.
    - Calls `connectDB()` (from [`config/db.md`](config/db.md)) to establish the MongoDB connection after the server starts listening.
    - Logs MongoDB connection status.

## Middleware Order Considerations

- `cors` and `cookieParser` are applied early to handle cross-origin requests and cookies for most routes.
- Body parsing middleware (`express.urlencoded`, `express.json`) are applied to handle request bodies.
- The `uploadRoutes` are mounted _before_ `express.json()`, suggesting they might rely on `express.urlencoded()` or handle raw/multipart data differently.
- Standard API routes and the external API router are mounted last.
