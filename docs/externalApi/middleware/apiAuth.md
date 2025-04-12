# API Authentication Middleware (`/externalApi/middleware/apiAuth.js`)

This file exports an asynchronous Express middleware function designed to authenticate requests made to the external API endpoints.

[Back to External API Overview](../index.md)

## Dependencies

- [`../../models/ApiClient.js`](../../models/README.md#apiclientjs): The Mongoose model for storing API client information (including API keys, status, and expiration).

## Functionality

The middleware performs the following steps for each incoming request:

1.  **Extract API Key:** It looks for an API key provided in the `x-api-key` HTTP header of the request.
2.  **Require Key:** If the `x-api-key` header is missing or empty, it immediately sends a `401 Unauthorized` response with an error message.
3.  **Fetch Active Clients:** It queries the database for all `ApiClient` records where `isActive` is true.
4.  **Validate Key:** It iterates through the active clients and compares their stored `apiKey` with the key provided in the header.
5.  **Check Expiry:** If a matching active client is found, it checks if the client has an `expiresAt` date set and if that date is in the past. If the key has expired, it sends a `403 Forbidden` response.
6.  **Attach Client & Proceed:** If a matching, active, and non-expired client is found, the client document is attached to the request object as `req.client`. The middleware then calls `next()` to pass control to the next middleware or route handler in the stack.
7.  **Invalid Key:** If no matching, active, non-expired client is found after checking all active clients, it sends a `403 Forbidden` response indicating an invalid API key.

## Usage

This middleware is typically applied globally to the main external API router (as seen in [`/externalApi/index.js`](../index.md)) to protect all external API endpoints.

```javascript
// Example usage in externalApi/index.js
import express from "express"
import apiAuth from "./middleware/apiAuth.js"
// ... import other routes

const router = express.Router()

// Apply the middleware to all subsequent routes
router.use(apiAuth)

// Mount specific resource routes
router.use("/user", userRoutes)
// ... other routes

export default router
```
