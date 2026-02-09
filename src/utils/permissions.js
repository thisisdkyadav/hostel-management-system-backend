/**
 * Default permission sets based on user roles
 */
export const DEFAULT_PERMISSIONS = {
  "Super Admin": {
    students_info: { view: true, edit: true, create: true, delete: true, react: true },
    student_inventory: { view: true, edit: true, create: true, delete: true, react: true },
    lost_and_found: { view: true, edit: true, create: true, delete: true, react: true },
    events: { view: true, edit: true, create: true, delete: true, react: true },
    visitors: { view: true, edit: true, create: true, delete: true, react: true },
    complaints: { view: true, edit: true, create: true, delete: true, react: true },
    feedback: { view: true, edit: true, create: true, delete: true, react: true },
    rooms: { view: true, edit: true, create: true, delete: true, react: true },
    hostels: { view: true, edit: true, create: true, delete: true, react: true },
    users: { view: true, edit: true, create: true, delete: true, react: true },
  },
  Admin: {
    students_info: { view: true, edit: true, create: true, delete: true, react: true },
    student_inventory: { view: true, edit: true, create: true, delete: true, react: true },
    lost_and_found: { view: true, edit: true, create: true, delete: true, react: true },
    events: { view: true, edit: true, create: true, delete: true, react: true },
    visitors: { view: true, edit: true, create: true, delete: true, react: true },
    complaints: { view: true, edit: true, create: true, delete: true, react: true },
    feedback: { view: true, edit: true, create: true, delete: true, react: true },
    rooms: { view: true, edit: true, create: true, delete: true, react: true },
    hostels: { view: true, edit: true, create: true, delete: true, react: true },
    users: { view: true, edit: true, create: true, delete: true, react: true },
  },
  Warden: {
    students_info: { view: true, edit: false, create: false, delete: false, react: true },
    student_inventory: { view: true, edit: true, create: true, delete: true, react: true },
    lost_and_found: { view: true, edit: false, create: false, delete: false, react: false },
    events: { view: true, edit: false, create: false, delete: false, react: false },
    visitors: { view: true, edit: false, create: false, delete: false, react: false },
    complaints: { view: true, edit: false, create: true, delete: false, react: false },
    feedback: { view: true, edit: false, create: false, delete: false, react: true },
  },
  "Associate Warden": {
    students_info: { view: true, edit: false, create: false, delete: false, react: true },
    student_inventory: { view: true, edit: true, create: true, delete: true, react: true },
    lost_and_found: { view: true, edit: true, create: true, delete: true, react: true },
    events: { view: true, edit: false, create: false, delete: false, react: false },
    visitors: { view: true, edit: true, create: false, delete: false, react: true },
    complaints: { view: true, edit: false, create: true, delete: false, react: true },
    feedback: { view: true, edit: false, create: false, delete: false, react: true },
  },
  "Hostel Supervisor": {
    students_info: { view: true, edit: false, create: false, delete: false, react: true },
    student_inventory: { view: true, edit: true, create: true, delete: true, react: true },
    lost_and_found: { view: true, edit: true, create: true, delete: true, react: true },
    events: { view: true, edit: false, create: false, delete: false, react: false },
    visitors: { view: true, edit: true, create: false, delete: false, react: true },
    complaints: { view: true, edit: false, create: true, delete: false, react: true },
    feedback: { view: true, edit: false, create: false, delete: false, react: true },
  },
  Security: {
    students_info: { view: true, edit: false, create: false, delete: false, react: false },
    student_inventory: { view: false, edit: false, create: false, delete: false, react: false },
    lost_and_found: { view: true, edit: true, create: true, delete: false, react: true },
    events: { view: true, edit: false, create: false, delete: false, react: false },
    visitors: { view: true, edit: true, create: true, delete: false, react: true },
  },
  "Hostel Gate": {
    students_info: { view: true, edit: false, create: false, delete: false, react: false },
    visitors: { view: true, edit: true, create: true, delete: false, react: true },
  },
  "Maintenance Staff": {
    complaints: { view: true, edit: true, create: false, delete: false, react: true },
  },
  Student: {
    events: { view: true, edit: false, create: false, delete: false, react: true },
    lost_and_found: { view: true, edit: false, create: true, delete: false, react: true },
    complaints: { view: true, edit: false, create: true, delete: false, react: false },
    feedback: { view: true, edit: false, create: true, delete: false, react: false },
    student_inventory: { view: true, edit: false, create: true, delete: false, react: false },
  },
  Gymkhana: {
    events: { view: true, edit: true, create: true, delete: false, react: true },
    activity_calendar: { view: true, edit: true, create: true, delete: false, react: true },
    event_proposals: { view: true, edit: true, create: true, delete: false, react: true },
    event_expenses: { view: true, edit: true, create: true, delete: false, react: true },
  },
}

/**
 * Initialize user permissions based on role
 * @param {String} role - User role
 * @returns {Object} - Default permissions for that role
 */
export const getDefaultPermissions = (role) => {
  return DEFAULT_PERMISSIONS[role] || {}
}

/**
 * Check if a user has permission for a specific action
 * @param {Object} user - User document (or session user data)
 * @param {String} resource - Resource name (e.g., 'students_info')
 * @param {String} action - Action type (view, edit, create, delete, react)
 * @returns {Boolean} - Whether user has permission
 */
export const hasPermission = (user, resource, action) => {
  if (!user || !resource || !action) return false

  // Super Admin always has all permissions
  if (user.role === "Super Admin") return true

  // for now this is only used for Warden, Associate Warden, Hostel Supervisor
  // if user have any other role, they will have all permissions
  if (user.role !== "Warden" && user.role !== "Associate Warden" && user.role !== "Hostel Supervisor") return true

  // Handle case where there are no permissions
  if (!user.permissions) return false

  // Handle permissions, whether it's a Map or plain object from session
  let resourcePermissions = null

  // Case 1: If permissions is a Map (from Mongoose model)
  if (user.permissions instanceof Map) {
    resourcePermissions = user.permissions.get(resource)
  }
  // Case 2: If permissions is an object (from session)
  else if (typeof user.permissions === "object") {
    resourcePermissions = user.permissions[resource]
  }

  if (!resourcePermissions) return false

  return resourcePermissions[action] === true
}

/**
 * Middleware to check if user has permission
 * @param {String} resource - Resource name
 * @param {String} action - Action type
 */
export const requirePermission = (resource, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      })
    }

    if (hasPermission(req.user, resource, action)) {
      return next()
    }

    return res.status(403).json({
      success: false,
      message: "You don't have permission to perform this action",
    })
  }
}
