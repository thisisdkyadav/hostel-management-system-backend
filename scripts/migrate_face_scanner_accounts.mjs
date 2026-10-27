/** Move ZKTeco credentials to accounts; defaults to a read-only dry run.
 * Usage: npm run migrate:scanner-accounts [-- --apply]
 * Stop scanner/admin writes while applying this migration.
 */
import mongoose from "mongoose"
import { env } from "../src/config/env.config.js"
import { scannerQueries } from "../src/services/scanner/scannerQueries.service.js"
import { withTransaction } from "../src/services/base/index.js"
import { scannerOwner } from "../src/services/scanner/scannerOwner.service.js"

try {
  if (process.argv.includes("--apply") && process.argv.includes("--dry-run")) {
    throw new Error("Choose --apply or --dry-run, not both")
  }
  const apply = process.argv.includes("--apply")
  await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false })
  const scanners = await scannerQueries.listUnmigratedZktecoScanners()
  const groups = new Map()
  for (const scanner of scanners) {
    if (typeof scanner.username !== "string" || !scanner.username.trim() || !scanner.passwordHash || !scanner.deviceName) {
      throw new Error(`Scanner ${scanner._id} lacks username, passwordHash or deviceName; repair it before migrating`)
    }
    const key = scanner.username.toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(scanner)
  }
  // Preflight all groups before any writes, including credentials reserved by legacy devices.
  for (const group of groups.values()) {
    const latest = group[0] // query sorts by updatedAt descending, then _id
    const collisions = await scannerQueries.findScannersByUsername(latest.username)
    if (collisions.some((scanner) => scanner.provider !== "zkteco")) {
      throw new Error(`Username ${latest.username} conflicts with a Time Watch/legacy scanner`)
    }
    const aliases = group.map((scanner) => scanner.deviceName)
    if (new Set(aliases).size !== aliases.length) throw new Error(`Duplicate device aliases for ${latest.username}`)
    if (await scannerQueries.findAccountByUsername(latest.username)) {
      throw new Error(`Account username ${latest.username} already exists for unmigrated scanners; resolve the collision before migrating`)
    }
    console.log(`Account ${latest.username}: ${group.length} scanner(s) (create)`)
    if (group.length > 1) {
      console.warn(`WARN shared username ${latest.username}; using credentials from most recently updated scanner ${latest._id}. Hashes cannot be compared; regenerate if a device fails. Scanners: ${group.map((scanner) => `${scanner._id} (${scanner.name}, ${scanner.deviceName})`).join(", ")}`)
    }
  }
  const indexes = await scannerQueries.scannerIndexes()
  const oldAliases = indexes.filter((index) => index.unique && Object.keys(index.key).length === 1 && index.key.deviceName === 1)
  console.log(`Global unique deviceName indexes: ${oldAliases.map((index) => index.name).join(", ") || "absent"}`)
  const legacyUsername = indexes.find((index) => index.name === "username_1" && index.unique)
  console.log(`Legacy unique username index: ${legacyUsername ? "username_1 (will be replaced by a non-unique index)" : "absent"}`)
  if (apply) {
    for (const group of groups.values()) {
      const latest = group[0]
      await withTransaction(async (session) => {
        const account = await scannerOwner.createAccount({
          name: latest.username, username: latest.username, passwordHash: latest.passwordHash,
        }, { session })
        await scannerOwner.migrateScannersToAccount(group, account._id, { session })
      })
    }
    await scannerOwner.syncAccountScannerIndexes()
    console.log(`Applied: ${groups.size} account group(s), ${scanners.length} scanner(s). Indexes synchronized.`)
  } else {
    console.log(`Dry run: ${groups.size} account group(s), ${scanners.length} scanner(s). No writes. Use --apply to migrate and synchronize indexes.`)
  }
} catch (error) {
  console.error("Scanner account migration failed:", error.message)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
