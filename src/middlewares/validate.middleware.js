/**
 * Request Validation Middleware
 * Validates request body/query/params against schema
 */
import { ValidationError } from "../core/errors/index.js"

/**
 * Create validation middleware for a schema
 * @param {Object} schema - Joi validation schema object
 * @param {string} source - Source to validate: 'body', 'query', 'params'
 * @returns {Function} Express middleware
 */
export const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const data = req[source]

    // If using Joi
    if (schema.validate) {
      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
      })

      if (error) {
        const errors = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }))
        throw new ValidationError("Validation failed", errors)
      }

      // Replace with validated/sanitized data. In Express 5 `req.query` is a
      // getter-only property and cannot be reassigned, so redefine it on this
      // request; `body`/`params` remain writable so plain assignment is fine.
      if (source === "query") {
        Object.defineProperty(req, "query", {
          value,
          writable: true,
          configurable: true,
          enumerable: true,
        })
      } else {
        req[source] = value
      }
    }

    next()
  }
}

/**
 * Validate request body
 * @param {Object} schema - Joi validation schema
 */
export const validateBody = (schema) => validate(schema, "body")

/**
 * Validate query parameters
 * @param {Object} schema - Joi validation schema
 */
export const validateQuery = (schema) => validate(schema, "query")

/**
 * Validate route parameters
 * @param {Object} schema - Joi validation schema
 */
export const validateParams = (schema) => validate(schema, "params")

export default validate
