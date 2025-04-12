# External API Routes (`/externalApi/routes`)

This directory contains Express router definitions for the external API endpoints.

[Back to External API Overview](../index.md)

## Overview

Each file in this directory typically corresponds to a specific data model or resource (e.g., `userRoutes.js`, `hostelRoutes.js`) and defines the routes for searching or interacting with that resource via the external API.

## Common Structure

Most route files follow a similar pattern:

1.  **Import Express:** `import express from "express";`
2.  **Import Controller:** Imports the corresponding controller function(s) from `../controllers/`. For example, `import { searchUsers } from "../controllers/userApi.js";`
3.  **Create Router:** `const router = express.Router();`
4.  **Define Routes:** Defines GET routes (usually `/search`) that map to the imported controller function.
5.  **Export Router:** `export default router;`

## Authentication & Authorization

It is assumed that authentication (e.g., API key validation via [`apiAuth.js`](../middleware/apiAuth.md)) and potentially authorization are handled by middleware applied _before_ these specific resource routers in the main application setup (e.g., in [`server.js`](../../server.md) or within the [`externalApi/index.js`](../index.md) router).

## Specific Route Files

Documentation for the specific endpoints provided by each route file can be found in the corresponding controller documentation located in [`/docs/externalApi/controllers/`](../controllers/README.md).

- `userRoutes.js` -> [`docs/externalApi/controllers/userApi.md`](../controllers/userApi.md)
- `studentProfileRoutes.js` -> [`docs/externalApi/controllers/studentProfileApi.md`](../controllers/studentProfileApi.md)
- `roomAllocationRoutes.js` -> [`docs/externalApi/controllers/roomAllocationApi.md`](../controllers/roomAllocationApi.md)
- `securityRoutes.js` -> [`docs/externalApi/controllers/securityApi.md`](../controllers/securityApi.md)
- `roomRoutes.js` -> [`docs/externalApi/controllers/roomApi.md`](../controllers/roomApi.md)
- `notificationRoutes.js` -> [`docs/externalApi/controllers/notificationApi.md`](../controllers/notificationApi.md)
- `maintenanceStaffRoutes.js` -> [`docs/externalApi/controllers/maintenanceStaffApi.md`](../controllers/maintenanceStaffApi.md)
- `lostAndFoundRoutes.js` -> [`docs/externalApi/controllers/lostAndFoundApi.md`](../controllers/lostAndFoundApi.md)
- `hostelRoutes.js` -> [`docs/externalApi/controllers/hostelApi.md`](../controllers/hostelApi.md)
- `feedbackRoutes.js` -> [`docs/externalApi/controllers/feedbackApi.md`](../controllers/feedbackApi.md)
- `eventRoutes.js` -> [`docs/externalApi/controllers/eventApi.md`](../controllers/eventApi.md)
- `discoActionRoutes.js` -> [`docs/externalApi/controllers/discoActionApi.md`](../controllers/discoActionApi.md)
- `associateWardenRoutes.js` -> [`docs/externalApi/controllers/associateWardenApi.md`](../controllers/associateWardenApi.md)
- `unitRoutes.js` -> [`docs/externalApi/controllers/unitApi.md`](../controllers/unitApi.md)
- `visitorRequestRoutes.js` -> [`docs/externalApi/controllers/visitorRequestApi.md`](../controllers/visitorRequestApi.md)
- `wardenRoutes.js` -> [`docs/externalApi/controllers/wardenApi.md`](../controllers/wardenApi.md)
- `complaintRoutes.js` -> [`docs/externalApi/controllers/complaintApi.md`](../controllers/complaintApi.md)
