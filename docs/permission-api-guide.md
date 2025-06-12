# Permission Management API Endpoints Guide

## Base URL

`/api/permissions`

## Authorization

All endpoints require authentication and Admin role access.

## Endpoints

### 1. List Users by Role

**Endpoint:** `GET /users/:role?`

**Parameters:**

- `role` (optional): Filter users by role (e.g., "Warden", "Hostel Supervisor")
- `page` (query, optional): Page number, default: 1
- `limit` (query, optional): Results per page, default: 10

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "userId",
      "name": "User Name",
      "email": "user@example.com",
      "role": "Warden",
      "permissions": {
        "students_info": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
        "events": { "view": true, "edit": true, "create": true, "delete": false, "react": true }
      }
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "pages": 10
  }
}
```

### 2. Get User Permissions

**Endpoint:** `GET /user/:userId`

**Parameters:**

- `userId`: The ID of the user

**Response:**

```json
{
  "success": true,
  "data": {
    "userId": "userId",
    "name": "User Name",
    "email": "user@example.com",
    "role": "Warden",
    "permissions": {
      "students_info": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
      "student_inventory": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
      "lost_and_found": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "events": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "visitors": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "complaints": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
      "feedback": { "view": true, "edit": true, "create": false, "delete": false, "react": true }
    }
  }
}
```

### 3. Update User Permissions

**Endpoint:** `PUT /user/:userId`

**Parameters:**

- `userId`: The ID of the user

**Request Body:**

```json
{
  "permissions": {
    "students_info": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
    "events": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
    "complaints": { "view": true, "edit": true, "create": false, "delete": false, "react": true }
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "User permissions updated successfully",
  "data": {
    "userId": "userId",
    "name": "User Name",
    "role": "Warden",
    "permissions": {
      "students_info": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
      "events": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "complaints": { "view": true, "edit": true, "create": false, "delete": false, "react": true }
    }
  }
}
```

### 4. Reset User Permissions

**Endpoint:** `POST /user/:userId/reset`

**Parameters:**

- `userId`: The ID of the user

**Response:**

```json
{
  "success": true,
  "message": "User permissions reset to default",
  "data": {
    "userId": "userId",
    "name": "User Name",
    "role": "Warden",
    "permissions": {
      "students_info": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
      "student_inventory": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
      "lost_and_found": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "events": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "visitors": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "complaints": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
      "feedback": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
      "rooms": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
      "hostels": { "view": true, "edit": false, "create": false, "delete": false, "react": true }
    }
  }
}
```

### 5. Reset Role Permissions

**Endpoint:** `POST /role/:role/reset`

**Description:** Resets permissions for all users with a specific role to the default permissions for that role. This is useful for batch updates when permission policies change.

**Parameters:**

- `role`: The role to reset permissions for (e.g., "Warden", "Student", "Hostel Supervisor")

**Response:**

```json
{
  "success": true,
  "message": "Successfully reset permissions for 15 users with role Warden",
  "data": {
    "role": "Warden",
    "usersUpdated": 15,
    "totalUsers": 15,
    "defaultPermissions": {
      "students_info": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
      "student_inventory": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
      "lost_and_found": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "events": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "visitors": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "complaints": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
      "feedback": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
      "rooms": { "view": true, "edit": false, "create": false, "delete": false, "react": true },
      "hostels": { "view": true, "edit": false, "create": false, "delete": false, "react": true }
    }
  }
}
```

### 6. Set Custom Role Permissions

**Endpoint:** `PUT /role/:role`

**Description:** Sets custom permissions for all users with a specific role, overwriting any individual customizations. Use this to define new permission sets for entire roles at once.

**Parameters:**

- `role`: The role to set permissions for (e.g., "Warden", "Student", "Hostel Supervisor")

**Request Body:**

```json
{
  "permissions": {
    "students_info": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
    "events": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
    "complaints": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
    "feedback": { "view": true, "edit": true, "create": true, "delete": false, "react": true }
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Successfully updated permissions for 15 users with role Warden",
  "data": {
    "role": "Warden",
    "usersUpdated": 15,
    "totalUsers": 15,
    "customPermissions": {
      "students_info": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
      "events": { "view": true, "edit": true, "create": true, "delete": false, "react": true },
      "complaints": { "view": true, "edit": true, "create": false, "delete": false, "react": true },
      "feedback": { "view": true, "edit": true, "create": true, "delete": false, "react": true }
    }
  }
}
```

## Available Permission Resources

The system now supports the following resources:

1. `students_info`: Student information access
2. `student_inventory`: Student inventory management
3. `lost_and_found`: Lost and found items
4. `events`: Event management
5. `visitors`: Visitor management
6. `complaints`: Complaint handling
7. `feedback`: Feedback management
8. `rooms`: Room management
9. `hostels`: Hostel management
10. `users`: User management

## Permission Actions

Each resource can have these actions:

- `view`: Permission to view/read
- `edit`: Permission to update/modify
- `create`: Permission to create new entries
- `delete`: Permission to delete entries
- `react`: Permission to react to entries (new action)

## Frontend Implementation Examples

### Checking Permissions in React

```jsx
// Example of checking permissions in a React component
import { useContext } from "react"
import { AuthContext } from "../contexts/AuthContext"

function EventDetails({ event }) {
  const { user } = useContext(AuthContext)

  // Helper function to check permissions
  const hasPermission = (resource, action) => {
    if (!user || !user.permissions) return false

    const resourcePermissions = user.permissions[resource]
    if (!resourcePermissions) return false

    return resourcePermissions[action] === true
  }

  return (
    <div className="event-card">
      <h3>{event.title}</h3>
      <p>{event.description}</p>

      {/* Only show edit button if user has edit permission for events */}
      {hasPermission("events", "edit") && <button className="edit-btn">Edit Event</button>}

      {/* Only show delete button if user has delete permission for events */}
      {hasPermission("events", "delete") && <button className="delete-btn">Delete Event</button>}

      {/* Only show react button if user has react permission for events */}
      {hasPermission("events", "react") && <button className="react-btn">👍 Like</button>}
    </div>
  )
}
```

### Permissions Management UI Example

```jsx
// Example of a permissions management component
import { useState, useEffect } from "react"
import axios from "axios"

function UserPermissions({ userId }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUserPermissions = async () => {
      try {
        const response = await axios.get(`/api/permissions/user/${userId}`)
        setUser(response.data.data)
        setPermissions(response.data.data.permissions)
        setLoading(false)
      } catch (error) {
        console.error("Error fetching user permissions:", error)
        setLoading(false)
      }
    }

    fetchUserPermissions()
  }, [userId])

  const handlePermissionChange = (resource, action, value) => {
    setPermissions((prev) => ({
      ...prev,
      [resource]: {
        ...prev[resource],
        [action]: value,
      },
    }))
  }

  const savePermissions = async () => {
    try {
      await axios.put(`/api/permissions/user/${userId}`, {
        permissions,
      })
      alert("Permissions updated successfully")
    } catch (error) {
      console.error("Error updating permissions:", error)
      alert("Failed to update permissions")
    }
  }

  const resetPermissions = async () => {
    try {
      const response = await axios.post(`/api/permissions/user/${userId}/reset`)
      setPermissions(response.data.data.permissions)
      alert("Permissions reset to default")
    } catch (error) {
      console.error("Error resetting permissions:", error)
      alert("Failed to reset permissions")
    }
  }

  if (loading) return <div>Loading...</div>
  if (!user) return <div>User not found</div>

  return (
    <div className="permissions-container">
      <h2>Permissions for {user.name}</h2>
      <p>Role: {user.role}</p>

      <div className="permissions-grid">
        <div className="header">
          <div>Resource</div>
          <div>View</div>
          <div>Edit</div>
          <div>Create</div>
          <div>Delete</div>
          <div>React</div>
        </div>

        {Object.entries(permissions).map(([resource, actions]) => (
          <div key={resource} className="resource-row">
            <div className="resource-name">{resource}</div>

            {["view", "edit", "create", "delete", "react"].map((action) => (
              <div key={action} className="permission-cell">
                <input type="checkbox" checked={actions[action] || false} onChange={(e) => handlePermissionChange(resource, action, e.target.checked)} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="action-buttons">
        <button onClick={savePermissions}>Save Changes</button>
        <button onClick={resetPermissions}>Reset to Default</button>
      </div>
    </div>
  )
}
```

### Role-Based Permission Management Example

```jsx
// Example of a role permissions management component
import { useState, useEffect } from "react"
import axios from "axios"

function RolePermissionsManager() {
  const [selectedRole, setSelectedRole] = useState("")
  const [permissions, setPermissions] = useState({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)

  const roles = ["Student", "Maintenance Staff", "Warden", "Associate Warden", "Admin", "Security", "Hostel Supervisor", "Hostel Gate"]

  // Available resources
  const resources = ["students_info", "student_inventory", "lost_and_found", "events", "visitors", "complaints", "feedback", "rooms", "hostels", "users"]

  // Available actions
  const actions = ["view", "edit", "create", "delete", "react"]

  // Fetch default permissions for selected role
  useEffect(() => {
    if (!selectedRole) {
      setPermissions({})
      return
    }

    const fetchDefaultPermissions = async () => {
      try {
        // This assumes you have an endpoint to get default permissions for a role
        // Alternative approach: use a predefined set of permissions from a constant
        const response = await axios.get(`/api/permissions/defaults/${selectedRole}`)
        setPermissions(response.data.permissions)
      } catch (error) {
        console.error("Error fetching default permissions:", error)
        // Initialize with empty permissions
        const initialPermissions = {}
        resources.forEach((resource) => {
          initialPermissions[resource] = {
            view: false,
            edit: false,
            create: false,
            delete: false,
            react: false,
          }
        })
        setPermissions(initialPermissions)
      }
    }

    fetchDefaultPermissions()
  }, [selectedRole])

  const handlePermissionChange = (resource, action, value) => {
    setPermissions((prev) => ({
      ...prev,
      [resource]: {
        ...(prev[resource] || {}),
        [action]: value,
      },
    }))
  }

  const applyToRole = async () => {
    if (!selectedRole) {
      alert("Please select a role")
      return
    }

    if (!confirm(`This will override custom permissions for ALL users with role "${selectedRole}". Continue?`)) {
      return
    }

    setLoading(true)
    try {
      const response = await axios.put(`/api/permissions/role/${selectedRole}`, {
        permissions,
      })
      setResult(response.data)
      alert(`Successfully updated permissions for ${response.data.data.usersUpdated} users with role ${selectedRole}`)
    } catch (error) {
      console.error("Error setting role permissions:", error)
      setResult({ error: error.response?.data || error.message })
      alert(`Failed to update permissions: ${error.response?.data?.message || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const resetRole = async () => {
    if (!selectedRole) {
      alert("Please select a role")
      return
    }

    if (!confirm(`This will reset permissions for ALL users with role "${selectedRole}" to system defaults. Continue?`)) {
      return
    }

    setLoading(true)
    try {
      const response = await axios.post(`/api/permissions/role/${selectedRole}/reset`)
      setResult(response.data)
      alert(`Successfully reset permissions for ${response.data.data.usersUpdated} users with role ${selectedRole}`)

      // Update the displayed permissions
      setPermissions(response.data.data.defaultPermissions)
    } catch (error) {
      console.error("Error resetting role permissions:", error)
      setResult({ error: error.response?.data || error.message })
      alert(`Failed to reset permissions: ${error.response?.data?.message || error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="role-permissions-manager">
      <h2>Manage Role Permissions</h2>
      <p>Set permissions for all users with a specific role. This will override any individual customizations.</p>

      <div className="form-group">
        <label htmlFor="role-select">Select Role:</label>
        <select id="role-select" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} disabled={loading}>
          <option value="">-- Select a role --</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>

      {selectedRole && (
        <div className="permissions-grid">
          <div className="header">
            <div>Resource</div>
            {actions.map((action) => (
              <div key={action}>{action.charAt(0).toUpperCase() + action.slice(1)}</div>
            ))}
          </div>

          {resources.map((resource) => (
            <div key={resource} className="resource-row">
              <div className="resource-name">{resource.replace(/_/g, " ")}</div>

              {actions.map((action) => (
                <div key={action} className="permission-cell">
                  <input type="checkbox" checked={permissions[resource]?.[action] || false} onChange={(e) => handlePermissionChange(resource, action, e.target.checked)} disabled={loading} />
                </div>
              ))}
            </div>
          ))}

          <div className="action-buttons">
            <button onClick={applyToRole} disabled={!selectedRole || loading} className="apply-button">
              {loading ? "Processing..." : "Apply to All Users with this Role"}
            </button>

            <button onClick={resetRole} disabled={!selectedRole || loading} className="reset-button">
              Reset to System Defaults
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="result-panel">
          <h3>Result:</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK`: Request successful
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: User doesn't have permission
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error responses follow this format:

```json
{
  "success": false,
  "message": "Error message description",
  "error": "Detailed error message (development environment only)"
}
```
