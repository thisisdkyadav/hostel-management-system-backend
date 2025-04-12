# Notification Routes (`/routes/notificationRoutes.js`)

Defines API routes for managing system notifications.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`notificationController.js`](../controllers/notificationController.md)
- Middleware:
  - [`authenticate`](../middlewares/auth.md#authenticate-req-res-next)

## Base Path

All routes defined in this file are mounted under `/api/v1/notifications` (assuming `/notifications` is the prefix used in `server.js`).

## Middleware Applied

- [`authenticate`](../middlewares/auth.md#authenticate-req-res-next): Applied globally via `router.use()`, ensuring all users accessing notification routes are logged in.

## Routes

- `POST /`:
  - Creates a new notification.
  - Controller: [`createNotification`](../controllers/notificationController.md#createnotificationreq-res)
- `GET /`:
  - Retrieves notifications (likely with pagination/filtering handled in the controller).
  - Controller: [`getNotifications`](../controllers/notificationController.md#getnotificationsreq-res)
- `GET /stats`:
  - Retrieves statistics about notifications.
  - Controller: [`getNotificationStats`](../controllers/notificationController.md#getnotificationstatsreq-res)
- `GET /active-count`:
  - Retrieves the count of active (unread) notifications for the logged-in user.
  - Controller: [`getActiveNotificationsCount`](../controllers/notificationController.md#getactivenotificationscountreq-res)
