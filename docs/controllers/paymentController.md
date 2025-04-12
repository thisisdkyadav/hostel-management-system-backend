# Payment Controller (`controllers/paymentController.js`)

Handles interactions with the Razorpay payment gateway to create payment links and check payment statuses.

[Back to Controllers Overview](README.md)

## Dependencies

- [`razorpay`](https://github.com/razorpay/razorpay-node): Razorpay Node.js SDK.
- `dotenv`: For loading environment variables.
- [`../config/environment.js`](../config/environment.md): Likely provides Razorpay keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
- [`../utils/errorHandler.js`](../utils/errorHandler.md): Utility for handling asynchronous errors.
- [`../utils/catchAsync.js`](../utils/catchAsync.md): Wrapper for asynchronous route handlers.

## Configuration

Requires the following environment variables to be set (loaded via [`environment.js`](../config/environment.md)):

- `RAZORPAY_KEY_ID`: Your Razorpay Key ID.
- `RAZORPAY_KEY_SECRET`: Your Razorpay Key Secret.

These are used to initialize the Razorpay instance.

## Functions

### `createPaymentLink(req, res)`

- **Description:** Creates a Razorpay payment link for a specified amount.
- **Method:** `POST`
- **Body:**
  - `amount` (Number, required): The amount for the payment in the base currency unit (e.g., INR). The controller multiplies this by 100 for Razorpay (paise).
- **Returns:**
  - `200 OK`: Payment link created successfully. Returns JSON object with `paymentLink` (the short URL) and `id` (the payment link ID).
  - `400 Bad Request`: Missing `amount` in the request body.
  - `500 Internal Server Error`: Failed to create the payment link via Razorpay API (handled by [`errorHandler`](../utils/errorHandler.md)).

### `checkPaymentStatus(req, res)`

- **Description:** Fetches the current status of a specific Razorpay payment link using the [`razorpay`](https://github.com/razorpay/razorpay-node) SDK.
- **Method:** `GET`
- **Params:**
  - `paymentLinkId` (String, required): The ID of the Razorpay payment link to check.
- **Returns:**
  - `200 OK`: Returns JSON object with `status` (e.g., 'created', 'paid', 'expired').
  - `500 Internal Server Error`: Failed to fetch the payment status from Razorpay API (handled by [`errorHandler`](../utils/errorHandler.md)).
