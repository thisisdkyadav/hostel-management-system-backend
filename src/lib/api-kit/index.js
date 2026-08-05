/**
 * api-kit - the HMS Express request / response / authorization spine.
 *
 * A single import surface for the primitives every module wires at its edges:
 *   - handler()    : controller adapter (ServiceResponse -> standard envelope)
 *   - routeGuard() : role -> routeKey authorization guard factory
 *   - the existing response / service primitives, re-exported so a module
 *     needs one import path instead of four.
 *
 * Prototype: lives in-repo today. It is deliberately self-contained so it can
 * be lifted into a standalone node package once proven across modules.
 */
export { handler } from "./handler.js"
export { routeGuard } from "./routeGuard.js"

// Existing primitives, re-exported through the same surface.
export { asyncHandler } from "../../utils/asyncHandler.js"
export { sendStandardResponse, sendRawResponse } from "../../utils/controllerHelpers.js"
export { ServiceResponse } from "../../services/base/ServiceResponse.js"
export { BaseService } from "../../services/base/BaseService.js"
