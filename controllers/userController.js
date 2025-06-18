import User from "../models/User.js"
import bcrypt from "bcrypt"

/**
 * Search users by name or email
 * @route GET /api/users/search
 * @access Admin
 */
export const searchUsers = async (req, res) => {
  try {
    const { query, role } = req.query

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Search query is required" })
    }

    // Build the search query
    const searchQuery = {
      $or: [{ name: { $regex: query, $options: "i" } }, { email: { $regex: query, $options: "i" } }],
    }

    // Add role filter if provided
    if (role) {
      searchQuery.role = role
    }

    // Search for users
    const users = await User.find(searchQuery).select("_id name email role phone profileImage").limit(5)

    res.status(200).json(users)
  } catch (error) {
    console.error("Error searching users:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

/**
 * Get user by ID
 * @route GET /api/users/:id
 * @access Admin
 */
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params

    const user = await User.findById(id).select("_id name email role phone profileImage")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.status(200).json(user)
  } catch (error) {
    console.error("Error fetching user:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

/**
 * Get users by role
 * @route GET /api/users/by-role
 * @access Admin
 */
export const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.query

    if (!role) {
      return res.status(400).json({ message: "Role parameter is required" })
    }

    const users = await User.find({ role }).select("_id name email role phone profileImage").sort({ name: 1 }).limit(50)

    res.status(200).json(users)
  } catch (error) {
    console.error("Error fetching users by role:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

/**
 * Bulk update user passwords
 * @route POST /api/users/bulk-password-update
 * @access Admin, Super Admin
 */
export const bulkPasswordUpdate = async (req, res) => {
  try {
    const { passwordUpdates } = req.body

    if (!passwordUpdates || !Array.isArray(passwordUpdates)) {
      return res.status(400).json({ message: "Password updates must be provided as an array" })
    }

    // Extract all emails to fetch users in one query
    const emails = passwordUpdates.map((update) => update.email)

    // Get all users that need to be updated in a single query
    const users = await User.find({ email: { $in: emails } }).select("+password")

    // Create a map of email to user for quick lookup
    const userMap = new Map()
    users.forEach((user) => userMap.set(user.email, user))

    const results = {
      successful: [],
      failed: [],
    }

    // Process each password update
    for (const update of passwordUpdates) {
      const { email, password } = update

      try {
        const user = userMap.get(email)

        if (!user) {
          results.failed.push({ email, reason: "User not found" })
          continue
        }

        // Handle null/empty password case
        if (password === null || password === undefined || password === "") {
          user.password = null
        } else {
          // Hash the password
          const salt = await bcrypt.genSalt(10)
          const hashedPassword = await bcrypt.hash(password, salt)
          user.password = hashedPassword
        }

        // Save updates to the user object but don't persist yet
        await user.save()

        results.successful.push({ email })
      } catch (error) {
        results.failed.push({ email, reason: error.message })
      }
    }

    res.status(200).json({
      message: "Bulk password update completed",
      results,
    })
  } catch (error) {
    console.error("Error in bulk password update:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

/**
 * Remove password for a specific user
 * @route POST /api/users/:id/remove-password
 * @access Admin, Super Admin
 */
export const removeUserPassword = async (req, res) => {
  try {
    const { id } = req.params

    const user = await User.findById(id)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Set password to null
    user.password = null
    await user.save()

    res.status(200).json({
      message: "Password removed successfully",
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    console.error("Error removing user password:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

/**
 * Bulk remove passwords for specified users
 * @route POST /api/users/bulk-remove-passwords
 * @access Admin, Super Admin
 */
export const bulkRemovePasswords = async (req, res) => {
  try {
    const { emails } = req.body

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ message: "Array of user emails is required" })
    }

    // Get all users that need to be updated in a single query
    const users = await User.find({ email: { $in: emails } })

    // Create a map of email to user for tracking
    const userMap = new Map()
    users.forEach((user) => userMap.set(user.email, user))

    const results = {
      successful: [],
      failed: [],
    }

    // Process each email
    for (const email of emails) {
      try {
        const user = userMap.get(email)

        if (!user) {
          results.failed.push({ email, reason: "User not found" })
          continue
        }

        // Set password to null
        user.password = null
        await user.save()

        results.successful.push({ email })
      } catch (error) {
        results.failed.push({ email, reason: error.message })
      }
    }

    res.status(200).json({
      message: "Bulk password removal completed",
      results,
    })
  } catch (error) {
    console.error("Error in bulk password removal:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

/**
 * Remove passwords for all users with a specific role
 * @route POST /api/users/remove-passwords-by-role
 * @access Super Admin
 */
export const removePasswordsByRole = async (req, res) => {
  try {
    const { role } = req.body

    if (!role) {
      return res.status(400).json({ message: "Role is required" })
    }

    // Find all users with the specified role
    const users = await User.find({ role })

    if (users.length === 0) {
      return res.status(404).json({ message: "No users found with the specified role" })
    }

    // Set password to null for all found users
    const updatePromises = users.map((user) => {
      user.password = null
      return user.save()
    })

    await Promise.all(updatePromises)

    res.status(200).json({
      message: `Passwords removed for ${users.length} users with role: ${role}`,
      count: users.length,
    })
  } catch (error) {
    console.error("Error removing passwords by role:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
