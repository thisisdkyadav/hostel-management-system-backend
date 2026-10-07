/** Replace the global username uniqueness constraint with provider-specific indexes.
 * Existing scanners retain legacy behavior until an admin selects their provider.
 * Usage: npm run migrate:scanner-providers [-- --apply]
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.config.js"
import FaceScanner from "../src/models/scanner/FaceScanner.model.js"

try {
  await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false })
  const collection = mongoose.connection.db.collection(FaceScanner.collection.name)
  let indexes = []
  try {
    indexes = await collection.indexes()
  } catch (error) {
    if (error.codeName !== "NamespaceNotFound") throw error
  }
  const legacyIndex = indexes.find((index) => index.unique && Object.keys(index.key).length === 1 && index.key.username === 1)
  console.log(`Global unique username index: ${legacyIndex?.name || "absent"}`)
  if (process.argv.includes("--apply")) {
    // Establish the new identity constraints before removing the old constraint.
    for (const [keys, options] of FaceScanner.schema.indexes()) {
      if (options.unique) await collection.createIndex(keys, options)
    }
    if (legacyIndex) await collection.dropIndex(legacyIndex.name)
    await FaceScanner.createIndexes()
    console.log("Scanner provider indexes applied. Existing scanner configuration was preserved.")
  } else {
    console.log("Dry run. Use --apply to allow shared ZKTeco usernames and enforce unique device names.")
  }
} catch (error) {
  console.error("Scanner provider migration failed:", error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
