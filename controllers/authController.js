import { isDevelopmentEnvironment } from "../config/environment.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"
import { generateKey } from "../utils/qrUtils.js"
import Session from "../models/Session.js"
import axios from "axios"

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

    // Check if user has a password set
    if (!user.password) {
      return res.status(401).json({ message: "Password not set for this account" })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    // Store user info in session
    req.session.userId = user._id
    req.session.role = user.role
    req.session.email = user.email

    const aesKey = user.aesKey ? user.aesKey : await generateKey(user.email)
    const userResponse = await User.findByIdAndUpdate(user._id, { aesKey }, { new: true })

    // Store essential user data in session with properly serialized permissions
    const essentialData = {
      _id: userResponse._id,
      email: userResponse.email,
      role: userResponse.role,
      // Convert Map to plain object for session storage
      permissions: Object.fromEntries(userResponse.permissions || new Map()),
      // Include hostel data if available
      hostel: userResponse.hostel,
    }

    req.session.userData = essentialData

    // Create device session record
    const userAgent = req.headers["user-agent"] || "Unknown"
    const deviceName = getDeviceNameFromUserAgent(userAgent)
    const ip = req.ip || req.connection.remoteAddress

    await Session.create({
      userId: user._id,
      sessionId: req.sessionID,
      userAgent: userAgent,
      ip: ip,
      deviceName: deviceName,
      loginTime: new Date(),
      lastActive: new Date(),
    })

    // Remove sensitive data and convert permissions Map to object for frontend
    const userResponseObj = userResponse.toObject()
    delete userResponseObj.password

    // Convert permissions Map to a plain object for frontend
    if (userResponseObj.permissions instanceof Map) {
      userResponseObj.permissions = Object.fromEntries(userResponseObj.permissions)
    }

    res.json({
      user: userResponseObj,
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

    // Store user info in session
    req.session.userId = user._id
    req.session.role = user.role
    req.session.email = user.email

    const aesKey = user.aesKey ? user.aesKey : await generateKey(user.email)
    const userResponse = await User.findByIdAndUpdate(user._id, { aesKey }, { new: true })

    // Store essential user data in session with properly serialized permissions
    const essentialData = {
      _id: userResponse._id,
      email: userResponse.email,
      role: userResponse.role,
      // Convert Map to plain object for session storage
      permissions: Object.fromEntries(userResponse.permissions || new Map()),
      // Include hostel data if available
      hostel: userResponse.hostel,
    }

    req.session.userData = essentialData

    // Create device session record
    const userAgent = req.headers["user-agent"] || "Unknown"
    const deviceName = getDeviceNameFromUserAgent(userAgent)
    const ip = req.ip || req.connection.remoteAddress

    await Session.create({
      userId: user._id,
      sessionId: req.sessionID,
      userAgent: userAgent,
      ip: ip,
      deviceName: deviceName,
      loginTime: new Date(),
      lastActive: new Date(),
    })

    // Remove sensitive data and convert permissions Map to object for frontend
    const userResponseObj = userResponse.toObject()
    delete userResponseObj.password

    // Convert permissions Map to a plain object for frontend
    if (userResponseObj.permissions instanceof Map) {
      userResponseObj.permissions = Object.fromEntries(userResponseObj.permissions)
    }

    res.json({
      user: userResponseObj,
      message: "Login successful",
    })
  } catch (error) {
    res.status(401).json({ message: "Invalid Google Token" })
  }
}

export const logout = async (req, res) => {
  if (req.sessionID) {
    try {
      // Remove the session from our own tracking
      await Session.deleteOne({ sessionId: req.sessionID })

      // Destroy the express session
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ message: "Logout failed" })
        }
        res.clearCookie("connect.sid")
        res.json({ message: "Logged out successfully" })
      })
    } catch (error) {
      console.error("Logout error:", error.message)
      res.status(500).json({ message: "Server error" })
    }
  } else {
    res.json({ message: "No active session" })
  }
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

    // Check if user has a password set
    if (!user.password) {
      return res.status(401).json({ message: "No password is currently set for this account" })
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

export const getUserDevices = async (req, res) => {
  try {
    const userId = req.user._id

    // Get all sessions from our tracking database
    const sessions = await Session.find({ userId }).sort({ lastActive: -1 })

    // Verify each session still exists in the session store
    const validSessions = []

    for (const session of sessions) {
      // Check if the session is the current one
      const isCurrent = session.sessionId === req.sessionID

      // For non-current sessions, verify they still exist in the session store
      if (isCurrent || (await sessionExistsInStore(req.sessionStore, session.sessionId))) {
        validSessions.push({
          ...session.toObject(),
          isCurrent,
        })
      } else {
        // If session doesn't exist in store but is in our tracking DB, clean it up
        await Session.deleteOne({ _id: session._id })
      }
    }

    res.json({ devices: validSessions })
  } catch (error) {
    console.error("Error fetching devices:", error)
    res.status(500).json({ message: "Server error" })
  }
}

// Helper function to check if a session exists in the session store
async function sessionExistsInStore(store, sessionId) {
  return new Promise((resolve) => {
    store.get(sessionId, (err, session) => {
      if (err || !session) {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

export const logoutDevice = async (req, res) => {
  try {
    const userId = req.user._id
    const { sessionId } = req.params

    // Verify the session belongs to the current user
    const session = await Session.findOne({
      sessionId: sessionId,
      userId: userId,
    })

    if (!session) {
      return res.status(404).json({ message: "Session not found or unauthorized" })
    }

    // If trying to logout current session, use regular logout
    if (sessionId === req.sessionID) {
      return logout(req, res)
    }

    // Delete the session from our tracking database
    await Session.deleteOne({ sessionId: sessionId })

    // Also destroy the actual Express session in MongoDB
    try {
      // Get the MongoDB connection from the session store
      const sessionStore = req.sessionStore

      // Destroy the session in the store
      sessionStore.destroy(sessionId, (err) => {
        if (err) {
          console.error("Error destroying session in store:", err)
        }
      })
    } catch (err) {
      console.error("Error accessing session store:", err)
    }

    res.json({ message: "Device logged out successfully" })
  } catch (error) {
    console.error("Error logging out device:", error)
    res.status(500).json({ message: "Server error" })
  }
}

export const verifySSOToken = async (req, res) => {
  const { token } = req.body

  if (!token) {
    return res.status(400).json({ message: "Token is required" })
  }

  try {
    // Verify token with SSO server
    const response = await axios.post("https://hms-sso.andiindia.in/api/auth/verify-sso-token", { token })

    if (!response.data.success) {
      return res.status(401).json({ message: "Invalid or expired SSO token" })
    }

    // Find user by email from SSO response
    const email = response.data.user.email
    const user = await User.findOne({ email }).exec()

    if (!user) {
      return res.status(404).json({ message: "User not found in system" })
    }

    // Store user info in session
    req.session.userId = user._id
    req.session.role = user.role
    req.session.email = user.email

    const aesKey = user.aesKey ? user.aesKey : await generateKey(user.email)
    const userResponse = await User.findByIdAndUpdate(user._id, { aesKey }, { new: true }).select("-password").exec()

    // Store essential user data in session with properly serialized permissions
    const essentialData = {
      _id: userResponse._id,
      email: userResponse.email,
      role: userResponse.role,
      // Convert Map to plain object for session storage
      permissions: Object.fromEntries(userResponse.permissions || new Map()),
      // Include hostel data if available
      hostel: userResponse.hostel,
    }

    req.session.userData = essentialData

    // Create device session record
    const userAgent = req.headers["user-agent"] || "Unknown"
    const deviceName = getDeviceNameFromUserAgent(userAgent)
    const ip = req.ip || req.connection.remoteAddress

    await Session.create({
      userId: user._id,
      sessionId: req.sessionID,
      userAgent: userAgent,
      ip: ip,
      deviceName: deviceName,
      loginTime: new Date(),
      lastActive: new Date(),
    })

    // Convert userResponse to object and ensure permissions is a plain object
    const userResponseObj = userResponse.toObject ? userResponse.toObject() : userResponse

    // Convert permissions Map to a plain object for frontend
    if (userResponseObj.permissions instanceof Map) {
      userResponseObj.permissions = Object.fromEntries(userResponseObj.permissions)
    }

    res.json({
      user: userResponseObj,
      message: "SSO authentication successful",
    })
  } catch (error) {
    console.error("SSO verification error:", error.message)
    res.status(500).json({ message: "Failed to verify SSO token" })
  }
}

// Helper function to extract device name from user agent
function getDeviceNameFromUserAgent(userAgent) {
  if (!userAgent) return "Unknown device"

  // Mobile detection
  if (/iPhone/.test(userAgent)) return "iPhone"
  if (/iPad/.test(userAgent)) return "iPad"
  if (/Android/.test(userAgent)) return "Android device"

  // Browser detection
  if (/Chrome/.test(userAgent) && !/Chromium|Edge/.test(userAgent)) return "Chrome browser"
  if (/Firefox/.test(userAgent)) return "Firefox browser"
  if (/Safari/.test(userAgent) && !/Chrome|Chromium/.test(userAgent)) return "Safari browser"
  if (/Edge|Edg/.test(userAgent)) return "Edge browser"
  if (/MSIE|Trident/.test(userAgent)) return "Internet Explorer"

  // OS detection for desktop
  if (/Windows/.test(userAgent)) return "Windows device"
  if (/Macintosh|Mac OS X/.test(userAgent)) return "Mac device"
  if (/Linux/.test(userAgent)) return "Linux device"

  return "Unknown device"
}
