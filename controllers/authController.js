import jwt from "jsonwebtoken"
import axios from "axios"
import { JWT_SECRET, isDev } from "../config/environment.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const login = async (req, res) => {
  const { email, password } = req.body
  try {
    const user = await User.findOne({ email }).populate("studentProfile").exec()
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" })
    }
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" })
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" })
    res.json({ token, user })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const loginWithGoogle = async (req, res) => {
  const { token, isMobile = false } = req.body
  try {
    const googleResponse = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`
    )

    const { email, name, picture } = googleResponse.data

    let user = await User.findOne({ email })
    if (!user) {
      user = new User({ email, name, picture })
      await user.save()
    }

    const jwtToken = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" })

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
