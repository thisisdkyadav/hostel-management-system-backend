# Payment Routes (`/routes/paymentRoutes.js`)

Defines API routes for handling payment processing, likely integrating with an external payment gateway.

[Back to Main API Routes Overview](README.md)

## Dependencies

- `express`: Web framework for Node.js.
- Controllers:
  - [`paymentController.js`](../controllers/paymentController.md)

## Base Path

All routes defined in this file are mounted under `/api/v1/payments` (assuming `/payments` is the prefix used in `server.js`).

## Middleware Applied

- No authentication middleware (`authenticate`) is explicitly applied within this router file. Authentication might be handled upstream or might not be required for these specific endpoints (e.g., if payment link creation is tied to an authenticated session elsewhere, or status checks are public).

## Routes

- `POST /create-link`:
  - Creates a payment link (likely by interacting with a payment gateway API).
  - Controller: [`createPaymentLink`](../controllers/paymentController.md#createpaymentlinkreq-res)
  - Authentication Required: Check controller/upstream middleware.
- `GET /status/:paymentLinkId`:
  - Checks the status of a payment associated with a specific payment link ID.
  - Controller: [`checkPaymentStatus`](../controllers/paymentController.md#checkpaymentstatusreq-res)
  - Authentication Required: Check controller/upstream middleware.
