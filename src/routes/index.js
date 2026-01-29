/**
 * Routes Index
 * Main entry point for all API routes
 * 
 * Exports routes organized by API version for easy versioning.
 * Currently supporting v1 routes with backward compatibility.
 */

// Export all v1 routes
export * from './v1/index.js';

// Re-export v1 as default version
import * as v1Routes from './v1/index.js';
export { v1Routes };
