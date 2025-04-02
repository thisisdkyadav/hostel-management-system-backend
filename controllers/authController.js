import jwt from "jsonwebtoken"
import axios from "axios"
import { JWT_SECRET, isDevelopmentEnvironment } from "../config/environment.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"
import { generateKey } from "../utils/qrUtils.js"

export const login = async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" })
  }

  try {
    const user = await User.findOne({ email }).select("+password").exec()

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        email: user.email,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    )

    const aesKey = user.aesKey ? user.aesKey : await generateKey(user.email)
    const userResponse = await User.findByIdAndUpdate(user._id, { aesKey }, { new: true })
    delete userResponse.password

    res.cookie("token", token, {
      httpOnly: true,
      secure: !isDevelopmentEnvironment,
      sameSite: !isDevelopmentEnvironment ? "None" : "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.json({
      user: userResponse,
      message: "Login successful",
    })
  } catch (error) {
    console.error("Login error:", error.message)
    res.status(500).json({ message: "Server error" })
  }
}

export const loginWithGoogle = async (req, res) => {
  const { token } = req.body
  try {
    const googleResponse = await axios.get(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`)

    const { email } = googleResponse.data

    let user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: "User not found" })
    }

    const jwtToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    )

    res.cookie("token", jwtToken, {
      httpOnly: true,
      secure: !isDevelopmentEnvironment,
      sameSite: !isDevelopmentEnvironment ? "None" : "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    const aesKey = user.aesKey ? user.aesKey : await generateKey(user.email)
    const userResponse = await User.findByIdAndUpdate(user._id, { aesKey }, { new: true })
    delete userResponse.password

    res.json({
      user: userResponse,
      message: "Login successful",
    })
  } catch (error) {
    res.status(401).json({ message: "Invalid Google Token" })
  }
}

export const logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: !isDevelopmentEnvironment,
    sameSite: !isDevelopmentEnvironment ? "None" : "Strict",
  })
  res.json({ message: "Logged out successfully" })
}

export const getUser = async (req, res) => {
  const user = req.user
  const userId = user._id

  try {
    const user = await User.findById(userId).select("-password").exec()
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    res.json(user)
  } catch (error) {
    console.error("Error fetching user:", error)
    res.status(500).json({ message: "Server error" })
  }
}

export const updatePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body
  const userId = req.user._id

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: "Old password and new password are required" })
  }

  try {
    const user = await User.findById(userId).select("+password").exec()
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Old password is incorrect" })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(newPassword, salt)
    user.password = hashedPassword
    await user.save()

    res.json({ message: "Password updated successfully" })
  } catch (error) {
    console.error("Error updating password:", error)
    res.status(500).json({ message: "Server error" })
  }
}
