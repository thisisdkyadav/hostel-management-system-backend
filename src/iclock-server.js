/**
 * iclock receiver entry point — a separate process from the main API.
 *
 * Face machines (ZKTeco PUSH protocol) talk only to this process. It shares the
 * database and the dining/gate services with the API, so a punch becomes a meal
 * record in-process with no extra HTTP hop. Run: `node src/iclock-server.js`
 * (pm2 app "hms-iclock"); port ICLOCK_PORT (default 5300).
 */
import { initializeDatabase, initializeSocketIO } from "./loaders/index.js"
import { iclockOwner } from "./services/iclock/iclockOwner.service.js"
import { createIclockApp } from "./apps/iclock/iclock.app.js"

const PORT = Number.parseInt(process.env.ICLOCK_PORT, 10) || 5300
const HOST = process.env.ICLOCK_HOST || "0.0.0.0"

const start = async () => {
  await initializeDatabase()
  // Unique (machine, person, time) must exist before the first upload, or a re-sent batch double-counts.
  await iclockOwner.ensureIndexes()
  // No HTTP server attached: this instance only PUBLISHES through the Redis adapter, so
  // live-feed events from punches reach browsers connected to the API instances.
  initializeSocketIO()
  const server = createIclockApp().listen(PORT, HOST, () => console.log(`📟 iclock receiver on ${HOST}:${PORT}`))
  server.keepAliveTimeout = 5000

  const shutdown = (signal) => {
    console.log(`📟 iclock receiver: ${signal}, closing`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5000).unref()
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
}

start().catch((error) => {
  console.error("iclock receiver failed to start:", error)
  process.exit(1)
})
