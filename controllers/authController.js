import jwt from "jsonwebtoken"
import axios from "axios"
import { JWT_SECRET, isDevelopmentEnvironment } from "../config/environment.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const login = async (req, res) => {
  const { email, password } = req.body

  // Validate input
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" })
  }

  try {
    // Find user with email but only select necessary fields
    const user = await User.findOne({ email }).select("+password").exec()

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    // Generate JWT token with role information
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    )

    // Remove sensitive data before sending response
    const userResponse = user.toObject ? user.toObject() : JSON.parse(JSON.stringify(user))
    delete userResponse.password

    // Set HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: !isDevelopmentEnvironment,
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    })

    // Return token and user data (without profile information)
    res.json({
      token,
      user: userResponse,
      message: "Login successful",
    })
  } catch (error) {
    console.error("Login error:", error.message)
    res.status(500).json({ message: "Server error" })
  }
}

export const loginWithGoogle = async (req, res) => {
  const { token, isMobile = false } = req.body
  try {
    const googleResponse = await axios.get(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`
    )

    const { email } = googleResponse.data

    let user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: "User not found" })
    }

    const jwtToken = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "7d" })

    if (isMobile) {
      return res.json({ jwt: jwtToken })
    } else {
      res.cookie("token", jwtToken, {
        httpOnly: true,
        secure: !isDevelopmentEnvironment,
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
