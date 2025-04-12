# External API Main Router (`/externalApi/index.js`)

This file sets up the main Express router for the entire `/api/external` path (assuming it's mounted under that path in the main application, see [`server.js`](../server.md)).

[Back to Documentation Index](../index.md)

## Functionality

1.  **Imports Routers:** Imports all the individual resource routers from the [`./routes/`](routes/README.md) directory (e.g., `userRoutes`, `hostelRoutes`, etc.).
2.  **Imports Middleware:** Imports the [`apiAuth`](middleware/apiAuth.md) middleware from `./middleware/apiAuth.js`.
3.  **Applies Middleware:** Applies the `apiAuth` middleware globally to all routes defined within this external API router using `router.use(apiAuth)`. This ensures that all external API requests must pass the authentication check defined in [`apiAuth.js`](middleware/apiAuth.md).
4.  **Mounts Resource Routers:** Mounts each imported resource router under a specific path prefix. For example:
    - `userRoutes` is mounted under `/user`.
    - `hostelRoutes` is mounted under `/hostel`.
    - `complaintRoutes` is mounted under `/complaint`.
    - ... and so on for all other resources. See [Routes Overview](routes/README.md).
5.  **Exports Router:** Exports the configured main router to be used by the main Express application.

## Base Path & Endpoints

If this router is mounted in the main application like `app.use('/api/external', externalApiRouter);`, then the full paths to the search endpoints would be:

- `GET /api/external/user/search`
- `GET /api/external/hostel/search`
- `GET /api/external/complaint/search`
- etc...

Refer to the documentation in [`/docs/externalApi/routes/README.md`](routes/README.md) and the individual controller docs in [`/docs/externalApi/controllers/`](controllers/README.md) for details on the specific endpoints and query parameters available under each resource path.
