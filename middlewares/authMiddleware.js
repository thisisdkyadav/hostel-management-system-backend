import jwt from "jsonwebtoken"
import { JWT_SECRET } from "../config/environment.js"

function authenticateJWT(req, res, next) {
  let token = req.cookies.token

  if (!token) {
    token = req.headers.authorization?.split(" ")[1]
  }

  if (!token) return res.status(401).json({ message: "Unauthorized" })

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid Token" })
    req.user = user
    next()
  })
}

export default authenticateJWT
