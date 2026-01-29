/**
 * LEGACY FILE - Re-exports from new location
 * TODO: Update all imports to use '../src/config' then delete this file
 * @see src/config/database.config.js
 */
export { connectDatabase as default, connectDatabase, connectDB } from "../src/config/database.config.js"