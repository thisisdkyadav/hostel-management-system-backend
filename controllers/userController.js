import User from "../models/User.js"

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
