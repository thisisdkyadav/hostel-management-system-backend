import User from "../models/User.js"
import { getDefaultPermissions } from "../utils/permissions.js"
import { isDevelopmentEnvironment } from "../config/environment.js"

/**
 * Get permissions for a specific user
 */
export const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Convert Map to plain object for response
    const permissionsObject = {}
    if (user.permissions) {
      for (const [key, value] of user.permissions.entries()) {
        permissionsObject[key] = value
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: permissionsObject,
      },
    })
  } catch (error) {
    console.error("Get user permissions error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user permissions",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * Update permissions for a specific user
 */
export const updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params
    const { permissions } = req.body

    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid permissions format",
      })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Create a new Map for permissions
    const permissionsMap = new Map()

    // Process each resource permission
    for (const [resource, actions] of Object.entries(permissions)) {
      permissionsMap.set(resource, {
        view: Boolean(actions.view),
        edit: Boolean(actions.edit),
        create: Boolean(actions.create),
        delete: Boolean(actions.delete),
        react: Boolean(actions.react),
      })
    }

    // Update user with new permissions
    user.permissions = permissionsMap
    await user.save()

    // Convert Map back to plain object for response
    const permissionsObject = {}
    for (const [key, value] of user.permissions.entries()) {
      permissionsObject[key] = value
    }

    return res.status(200).json({
      success: true,
      message: "User permissions updated successfully",
      data: {
        userId: user._id,
        name: user.name,
        role: user.role,
        permissions: permissionsObject,
      },
    })
  } catch (error) {
    console.error("Update user permissions error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to update user permissions",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * Reset a user's permissions to the default for their role
 */
export const resetUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Get default permissions for user's role
    const defaultPermissions = getDefaultPermissions(user.role)

    // Create a new Map for permissions
    const permissionsMap = new Map()

    // Process each resource permission
    for (const [resource, actions] of Object.entries(defaultPermissions)) {
      permissionsMap.set(resource, {
        view: Boolean(actions.view),
        edit: Boolean(actions.edit),
        create: Boolean(actions.create),
        delete: Boolean(actions.delete),
        react: Boolean(actions.react),
      })
    }

    // Update user with default permissions
    user.permissions = permissionsMap
    await user.save()

    // Convert Map back to plain object for response
    const permissionsObject = {}
    for (const [key, value] of user.permissions.entries()) {
      permissionsObject[key] = value
    }

    return res.status(200).json({
      success: true,
      message: "User permissions reset to default",
      data: {
        userId: user._id,
        name: user.name,
        role: user.role,
        permissions: permissionsObject,
      },
    })
  } catch (error) {
    console.error("Reset user permissions error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to reset user permissions",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * Get users by role with their permissions
 */
export const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params
    const { page = 1, limit = 10 } = req.query

    const query = role ? { role } : {}

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { name: 1 },
    }

    const users = await User.find(query)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .sort(options.sort)
      .select("name email role permissions")

    const totalUsers = await User.countDocuments(query)

    // Convert Map to plain object for each user
    const formattedUsers = users.map((user) => {
      const permissionsObject = {}
      if (user.permissions) {
        for (const [key, value] of user.permissions.entries()) {
          permissionsObject[key] = value
        }
      }

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: permissionsObject,
      }
    })

    return res.status(200).json({
      success: true,
      data: formattedUsers,
      pagination: {
        total: totalUsers,
        page: options.page,
        limit: options.limit,
        pages: Math.ceil(totalUsers / options.limit),
      },
    })
  } catch (error) {
    console.error("Get users by role error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve users",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * Update User model to set default permissions when a user is created
 */
export const initializeUserPermissions = async (userId) => {
  try {
    const user = await User.findById(userId)

    if (!user) {
      console.error(`User not found: ${userId}`)
      return false
    }

    // Get default permissions for user's role
    const defaultPermissions = getDefaultPermissions(user.role)

    // Create a new Map for permissions
    const permissionsMap = new Map()

    // Process each resource permission
    for (const [resource, actions] of Object.entries(defaultPermissions)) {
      permissionsMap.set(resource, {
        view: Boolean(actions.view),
        edit: Boolean(actions.edit),
        create: Boolean(actions.create),
        delete: Boolean(actions.delete),
        react: Boolean(actions.react),
      })
    }

    // Update user with default permissions
    user.permissions = permissionsMap
    await user.save()

    return true
  } catch (error) {
    console.error("Initialize user permissions error:", error)
    return false
  }
}

/**
 * Reset permissions for all users with a specific role
 */
export const resetRolePermissions = async (req, res) => {
  try {
    const { role } = req.params

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role parameter is required",
      })
    }

    // Validate that the role exists in the system
    const validRoles = ["Student", "Maintenance Staff", "Warden", "Associate Warden", "Admin", "Security", "Super Admin", "Hostel Supervisor", "Hostel Gate"]
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
      })
    }

    // Get default permissions for the role
    const defaultPermissions = getDefaultPermissions(role)

    // Find all users with the specified role
    const users = await User.find({ role })

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No users found with role: ${role}`,
      })
    }

    // Count of successfully updated users
    let successCount = 0

    // Update each user's permissions
    for (const user of users) {
      // Create a new Map for permissions
      const permissionsMap = new Map()

      // Process each resource permission
      for (const [resource, actions] of Object.entries(defaultPermissions)) {
        permissionsMap.set(resource, {
          view: Boolean(actions.view),
          edit: Boolean(actions.edit),
          create: Boolean(actions.create),
          delete: Boolean(actions.delete),
          react: Boolean(actions.react),
        })
      }

      // Update user with default permissions
      user.permissions = permissionsMap
      await user.save()
      successCount++
    }

    return res.status(200).json({
      success: true,
      message: `Successfully reset permissions for ${successCount} users with role ${role}`,
      data: {
        role,
        usersUpdated: successCount,
        totalUsers: users.length,
        defaultPermissions,
      },
    })
  } catch (error) {
    console.error("Reset role permissions error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to reset role permissions",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * Set custom permissions for all users with a specific role
 */
export const setRolePermissions = async (req, res) => {
  try {
    const { role } = req.params
    const { permissions } = req.body

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role parameter is required",
      })
    }

    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid permissions format",
      })
    }

    // Validate that the role exists in the system
    const validRoles = ["Student", "Maintenance Staff", "Warden", "Associate Warden", "Admin", "Security", "Super Admin", "Hostel Supervisor", "Hostel Gate"]
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
      })
    }

    // Find all users with the specified role
    const users = await User.find({ role })

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No users found with role: ${role}`,
      })
    }

    // Count of successfully updated users
    let successCount = 0

    // Update each user's permissions
    for (const user of users) {
      // Create a new Map for permissions
      const permissionsMap = new Map()

      // Process each resource permission
      for (const [resource, actions] of Object.entries(permissions)) {
        permissionsMap.set(resource, {
          view: Boolean(actions.view),
          edit: Boolean(actions.edit),
          create: Boolean(actions.create),
          delete: Boolean(actions.delete),
          react: Boolean(actions.react),
        })
      }

      // Update user with custom permissions
      user.permissions = permissionsMap
      await user.save()
      successCount++
    }

    return res.status(200).json({
      success: true,
      message: `Successfully updated permissions for ${successCount} users with role ${role}`,
      data: {
        role,
        usersUpdated: successCount,
        totalUsers: users.length,
        customPermissions: permissions,
      },
    })
  } catch (error) {
    console.error("Set role permissions error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to set role permissions",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}
