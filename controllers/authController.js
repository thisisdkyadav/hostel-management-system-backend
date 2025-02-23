import jwt from "jsonwebtoken"
import axios from "axios"
import { JWT_SECRET, isDev } from "../config/environment.js"

export const loginWithGoogle = async (req, res) => {
  const { token, isMobile = false } = req.body
  try {
    const googleResponse = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`
    )

    const { email, name, picture } = googleResponse.data

    const jwtToken = jwt.sign({ email, name, picture }, JWT_SECRET, { expiresIn: "7d" })

    if (isMobile) {
      return res.json({ jwt: jwtToken })
    } else {
      res.cookie("token", jwtToken, {
        httpOnly: true,
        secure: !isDev,
        sameSite: "Strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      })

      res.json({ message: "Login successful!" })
    }
  } catch (error) {
    res.status(401).json({ message: "Invalid Google Token" })
  }
}

export const logout = async (req, res) => {
  res.clearCookie("token")
  res.json({ message: "Logged out successfully" })
}
