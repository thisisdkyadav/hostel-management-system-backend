/**
 * iclock app — the HTTP face of the ZKTeco PUSH receiver.
 *
 * Deliberately NOT part of the main API app: no sessions, cookies, CORS or
 * JSON parsing. Machines speak plain-text HTTP to /iclock/*; every body is
 * taken raw and handed to the iclock service, which returns the exact answer.
 */
import express from "express"
import { handleIclockFileRequest, handleIclockRequest } from "../../services/iclock/iclock.service.js"

export const createIclockApp = () => {
  const app = express()
  app.disable("x-powered-by")
  app.set("trust proxy", true)
  app.set("query parser", "simple")

  app.get("/health", (req, res) => res.type("text/plain").send("ok"))

  // Machines download face photos by the relative Url in a BIOPHOTO command (no SN on
  // these requests); the token in the path is what authorises it.
  app.get(/^\/iclock\/file\/.*/, async (req, res) => {
    const result = await handleIclockFileRequest({ path: req.path, ip: req.ip })
    res.status(result.status).set("Cache-Control", "no-store").type(result.contentType).send(result.body)
  })

  app.all(/^\/iclock\/.*/, express.raw({ type: () => true, limit: "20mb" }), async (req, res) => {
    const result = await handleIclockRequest({
      method: req.method,
      path: req.path,
      query: req.query,
      body: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      headers: req.headers,
      ip: req.ip,
    })
    res.status(result.status).set("Cache-Control", "no-store").type("text/plain").send(result.body)
  })

  app.use((req, res) => res.status(404).type("text/plain").send("Not found"))
  return app
}

export default createIclockApp
