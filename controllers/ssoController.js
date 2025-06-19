import { JWT_SECRET } from "../config/environment.js"
import jwt from "jsonwebtoken"

export const redirect = async (req, res) => {
  const redirectTo = req.query.redirect_to

  if (!redirectTo) {
    return res.status(400).json({ error: "Missing redirect_to parameter" })
  }
  const token = jwt.sign(req.session.user, JWT_SECRET)

  const redirectUrl = new URL(redirectTo)
  redirectUrl.searchParams.append("token", token)

  res.redirect(redirectUrl.toString())
}

export const verifySSOToken = async (req, res) => {
  const { token } = req.body

  if (!token) {
    return res.status(400).json({
      success: false,
      error: "Token is required",
    })
  }

  const decoded = jwt.verify(token, JWT_SECRET)

  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    })
  }

  return res.json({
    success: true,
    user: { email: decoded.email },
  })
}
