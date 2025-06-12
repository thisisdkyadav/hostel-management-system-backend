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
    students_info: { view: true, edit: true, create: true, delete: false, react: true },
    student_inventory: { view: true, edit: true, create: true, delete: false, react: true },
    lost_and_found: { view: true, edit: true, create: true, delete: true, react: true },
    events: { view: true, edit: true, create: true, delete: true, react: true },
    visitors: { view: true, edit: true, create: true, delete: false, react: true },
    complaints: { view: true, edit: true, create: false, delete: false, react: true },
    feedback: { view: true, edit: true, create: false, delete: false, react: true },
    rooms: { view: true, edit: true, create: true, delete: false, react: true },
    hostels: { view: true, edit: true, create: false, delete: false, react: true },
    users: { view: true, edit: true, create: true, delete: false, react: true },
  },
  Warden: {
    students_info: { view: true, edit: false, create: false, delete: false, react: true },
    student_inventory: { view: true, edit: false, create: false, delete: false, react: true },
    lost_and_found: { view: true, edit: true, create: true, delete: false, react: true },
    events: { view: true, edit: true, create: true, delete: false, react: true },
    visitors: { view: true, edit: true, create: true, delete: false, react: true },
    complaints: { view: true, edit: true, create: false, delete: false, react: true },
    feedback: { view: true, edit: true, create: false, delete: false, react: true },
    rooms: { view: true, edit: false, create: false, delete: false, react: true },
    hostels: { view: true, edit: false, create: false, delete: false, react: true },
  },
  "Associate Warden": {
    students_info: { view: true, edit: false, create: false, delete: false, react: true },
    student_inventory: { view: true, edit: false, create: false, delete: false, react: true },
    lost_and_found: { view: true, edit: true, create: true, delete: false, react: true },
    events: { view: true, edit: true, create: true, delete: false, react: true },
    visitors: { view: true, edit: true, create: true, delete: false, react: true },
    complaints: { view: true, edit: true, create: false, delete: false, react: true },
    feedback: { view: true, edit: true, create: false, delete: false, react: true },
    rooms: { view: true, edit: false, create: false, delete: false, react: true },
  },
  "Hostel Supervisor": {
    students_info: { view: true, edit: false, create: false, delete: false, react: true },
    student_inventory: { view: true, edit: false, create: false, delete: false, react: true },
    lost_and_found: { view: true, edit: true, create: true, delete: false, react: true },
    events: { view: true, edit: false, create: false, delete: false, react: true },
    visitors: { view: true, edit: true, create: true, delete: false, react: true },
    complaints: { view: true, edit: true, create: false, delete: false, react: true },
    feedback: { view: true, edit: true, create: false, delete: false, react: true },
    rooms: { view: true, edit: false, create: false, delete: false, react: true },
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
 * @param {Object} user - User document
 * @param {String} resource - Resource name (e.g., 'students_info')
 * @param {String} action - Action type (view, edit, create, delete, react)
 * @returns {Boolean} - Whether user has permission
 */
export const hasPermission = (user, resource, action) => {
  if (!user || !resource || !action) return false

  // Super Admin always has all permissions
  if (user.role === "Super Admin") return true

  if (!user.permissions) return false

  const resourcePermissions = user.permissions.get(resource)
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
