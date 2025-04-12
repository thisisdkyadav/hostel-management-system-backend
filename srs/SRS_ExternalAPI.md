### 4.4 External API Module (`/externalApi`)

**Purpose:** This module appears to expose a subset of the application's functionalities via a separate API endpoint (`/external-api`), potentially for consumption by other internal or trusted external systems, likely using a different authentication mechanism (API key based).

**General Requirements:**

- **EXT-GR-1:** The module shall be mounted under the `/external-api` path prefix (as defined in `server.js`).
- **EXT-GR-2:** All routes within this module shall be protected by a dedicated API authentication middleware (`externalApi/middleware/apiAuth.js`). This middleware likely validates an API key or token passed in headers or query parameters.
- **EXT-GR-3:** The module shall reuse existing controllers and logic where possible, but may have dedicated routes (`externalApi/routes/`) or controllers (`externalApi/controllers/`) if the exposed functionality or data format differs from the main API.
- **EXT-GR-4:** The specific functionalities exposed through this API shall be explicitly defined by the routes configured in `externalApi/index.js`. Based on the file, this includes functionalities related to: Warden, Complaint, Security, LostAndFound, MaintenanceStaff, Unit, AssociateWarden, Hostel, Feedback, VisitorRequest, DisCoAction, Room, Event, RoomAllocation, Notification, StudentProfile, and User.
- **EXT-GR-5:** Data returned by this API should be carefully considered to avoid exposing sensitive information not intended for external consumption.

**Specific Requirements (Inferred from `externalApi/index.js`):**

- **EXT-Auth-1:** Requests to `/external-api/*` must pass validation by the `apiAuth` middleware. The exact mechanism (e.g., checking `X-API-KEY` header) needs to be defined within that middleware.
- **EXT-Routes-1:** Routes like `/external-api/warden`, `/external-api/complaint`, etc., map to their respective route handlers defined within the `externalApi/routes/` directory. These handlers likely call controller functions (potentially shared with the main API, or specific external API controllers).
- **EXT-Functionality-1:** The external API provides programmatic access to manage or retrieve data related to core HMS entities as listed in EXT-GR-4. The exact operations (GET, POST, PUT, DELETE) available for each entity depend on the specific route definitions within the module.

_(Further details require examining the `apiAuth.js` middleware and the specific route/controller files within the `/externalApi` directory.)_
