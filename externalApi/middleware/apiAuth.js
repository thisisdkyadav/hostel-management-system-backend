import ApiClient from "../../models/ApiClient.js"

export default async function (req, res, next) {
  const apiKey = req.headers["x-api-key"]
  if (!apiKey) return res.status(401).json({ error: "API key required" })

  const clients = await ApiClient.find({ isActive: true })
  const client = clients.find((client) => client.apiKey === apiKey)
  if (client) {
    const currentTime = new Date()
    if (client.expiresAt && client.expiresAt < currentTime) {
      return res.status(403).json({ error: "API key expired" })
    }
    req.client = client
    return next()
  }

  return res.status(403).json({ error: "Invalid API key" })
}
