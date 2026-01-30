/**
 * Service Response Helpers
 * Standardizes all service layer responses
 * 
 * @module services/base/ServiceResponse
 */

export class ServiceResponse {
  /**
   * Success response
   * @param {any} data - Response data
   * @param {number} statusCode - HTTP status code (default: 200)
   * @param {string} message - Optional success message
   */
  static success(data, statusCode = 200, message = null) {
    const response = { success: true, statusCode, data };
    if (message) response.message = message;
    return response;
  }

  /**
   * Created response (201)
   */
  static created(data, message = 'Created successfully') {
    return { success: true, statusCode: 201, data, message };
  }

  /**
   * Error response
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} errorDetails - Optional error details (for logging)
   */
  static error(message, statusCode = 500, errorDetails = null) {
    const response = { success: false, statusCode, message };
    if (errorDetails && process.env.NODE_ENV === 'development') {
      response.error = errorDetails;
    }
    return response;
  }

  /**
   * Not Found response (404)
   */
  static notFound(entity = 'Resource') {
    return { success: false, statusCode: 404, message: `${entity} not found` };
  }

  /**
   * Bad Request response (400)
   */
  static badRequest(message = 'Bad request') {
    return { success: false, statusCode: 400, message };
  }

  /**
   * Unauthorized response (401)
   */
  static unauthorized(message = 'Unauthorized') {
    return { success: false, statusCode: 401, message };
  }

  /**
   * Forbidden response (403)
   */
  static forbidden(message = 'Access denied') {
    return { success: false, statusCode: 403, message };
  }

  /**
   * Conflict response (409)
   */
  static conflict(message = 'Resource already exists') {
    return { success: false, statusCode: 409, message };
  }

  /**
   * Paginated response
   */
  static paginated(items, { page, limit, total }) {
    return {
      success: true,
      statusCode: 200,
      data: {
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total
        }
      }
    };
  }
}

// Shorthand exports
export const success = ServiceResponse.success.bind(ServiceResponse);
export const created = ServiceResponse.created.bind(ServiceResponse);
export const error = ServiceResponse.error.bind(ServiceResponse);
export const notFound = ServiceResponse.notFound.bind(ServiceResponse);
export const badRequest = ServiceResponse.badRequest.bind(ServiceResponse);
export const unauthorized = ServiceResponse.unauthorized.bind(ServiceResponse);
export const forbidden = ServiceResponse.forbidden.bind(ServiceResponse);
export const conflict = ServiceResponse.conflict.bind(ServiceResponse);
export const paginated = ServiceResponse.paginated.bind(ServiceResponse);

export default ServiceResponse;
