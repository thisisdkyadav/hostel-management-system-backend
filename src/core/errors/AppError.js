/**
 * Base Application Error
 * All custom errors extend this class
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational // Operational errors vs programming errors
    this.timestamp = new Date().toISOString()
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
    }
  }
}

/**
 * 422 Validation Error
 */
export class ValidationError extends AppError {
  constructor(message = "Validation failed", errors = []) {
    super(message, 422)
    this.errors = errors
  }

  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors,
    }
  }
}

export default AppError
