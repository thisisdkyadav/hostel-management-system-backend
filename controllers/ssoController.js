import { JWT_SECRET } from "../config/environment.js"
import jwt from "jsonwebtoken"

export const redirect = async (req, res) => {
  const redirectTo = req.query.redirect_to

  if (!redirectTo) {
    return res.status(400).json({ error: "Missing redirect_to parameter" })
  }

  // Fix: Use the proper session data structure
  const userData = req.session.userData || {
    email: req.session.email,
    role: req.session.role,
  }

  // Only attempt to sign if we have user data
  if (!userData || !Object.keys(userData).length) {
    return res.status(401).json({ error: "No user data in session" })
  }

  const token = jwt.sign(userData, JWT_SECRET)

  const redirectUrl = new URL(redirectTo)
  redirectUrl.searchParams.append("token", token)

  res.redirect(redirectUrl.toString())
}

export const verifySSOToken = async (req, res) => {
  // const { token } = req.body
  // get token from url
  const token = req.query.token

  if (!token) {
    return res.status(400).json({
      success: false,
      error: "Token is required",
    })
  }

  try {
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
  } catch (error) {
    console.error("Token verification error:", error.message)
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token: " + error.message,
    })
  }
}
