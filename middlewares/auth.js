import jwt from "jsonwebtoken"
import User from "../models/User.js"
import { JWT_SECRET } from "../config/environment.js"

// Middleware to check if user is authenticated
export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded.id).select("-password")

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid authentication token" })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ success: false, message: "Authentication failed" })
  }
}
