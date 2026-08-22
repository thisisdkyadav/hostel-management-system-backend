/**
 * Shared handling for errors caught inside service try/catch blocks.
 *
 * Blanket catches must not swallow the two Mongoose errors the global error
 * handler already maps to precise client responses:
 *   - CastError        -> 400 "Invalid ID format"
 *   - ValidationError  -> 422 with per-field errors
 * Call `rethrowKnownMongooseErrors(err)` first in a catch block; anything else
 * keeps flowing into the caller's own fallback envelope.
 */
export const rethrowKnownMongooseErrors = (err) => {
  if (err && (err.name === "CastError" || err.name === "ValidationError")) {
    throw err
  }
}

export default rethrowKnownMongooseErrors
