import Task from "../models/Task.js"
import User from "../models/User.js"

// Create a new task (admin only)
export const createTask = async (req, res) => {
  try {
    const { title, description, priority, dueDate, category, assignedUsers } = req.body

    // Validate required fields
    if (!title || !description || !dueDate) {
      return res.status(400).json({ message: "Title, description, and due date are required" })
    }

    // Validate assigned users exist
    if (assignedUsers && assignedUsers.length > 0) {
      const userCount = await User.countDocuments({
        _id: { $in: assignedUsers },
      })

      if (userCount !== assignedUsers.length) {
        return res.status(400).json({ message: "One or more assigned users do not exist" })
      }
    }

    // Create new task
    const newTask = new Task({
      title,
      description,
      priority: priority || "Medium",
      dueDate,
      category: category || "Other",
      assignedUsers: assignedUsers || [],
      createdBy: req.user.id, // Assuming req.user contains logged in user details
    })

    const savedTask = await newTask.save()

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      task: savedTask,
    })
  } catch (error) {
    console.error("Error creating task:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get all tasks with pagination (admin only)
export const getAllTasks = async (req, res) => {
  try {
    const { status, category, priority, page = 1, limit = 12 } = req.query

    // Convert string params to numbers
    const pageNum = parseInt(page, 10)
    const limitNum = parseInt(limit, 10)

    // Validate pagination params
    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return res.status(400).json({ message: "Invalid pagination parameters" })
    }

    // Build filter object
    const filter = {}

    if (status) filter.status = status
    if (category) filter.category = category
    if (priority) filter.priority = priority

    // Get total count for pagination metadata
    const totalTasks = await Task.countDocuments(filter)

    // Calculate pagination values
    const totalPages = Math.ceil(totalTasks / limitNum)
    const skip = (pageNum - 1) * limitNum

    // Get tasks with pagination
    const tasks = await Task.find(filter).populate("assignedUsers", "name email role").populate("createdBy", "name email").sort({ createdAt: -1 }).skip(skip).limit(limitNum)

    res.status(200).json({
      tasks,
      pagination: {
        total: totalTasks,
        totalPages,
        currentPage: pageNum,
        perPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching tasks:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Get tasks assigned to the logged-in user with pagination
export const getUserTasks = async (req, res) => {
  try {
    const userId = req.user.id
    const { status, category, priority, page = 1, limit = 12 } = req.query

    // Convert string params to numbers
    const pageNum = parseInt(page, 10)
    const limitNum = parseInt(limit, 10)

    // Validate pagination params
    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return res.status(400).json({ message: "Invalid pagination parameters" })
    }

    // Build filter object
    const filter = {
      assignedUsers: userId,
    }

    if (status) filter.status = status
    if (category) filter.category = category
    if (priority) filter.priority = priority

    // Get total count for pagination metadata
    const totalTasks = await Task.countDocuments(filter)

    // Calculate pagination values
    const totalPages = Math.ceil(totalTasks / limitNum)
    const skip = (pageNum - 1) * limitNum

    // Get tasks with pagination
    const tasks = await Task.find(filter)
      .populate("assignedUsers", "name email role")
      .populate("createdBy", "name email")
      .sort({ dueDate: 1 }) // Sort by due date ascending
      .skip(skip)
      .limit(limitNum)

    res.status(200).json({
      tasks,
      pagination: {
        total: totalTasks,
        totalPages,
        currentPage: pageNum,
        perPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    })
  } catch (error) {
    console.error("Error fetching user tasks:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Update task status (admin or assigned user)
export const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body
    const userId = req.user.id

    // Validate status value
    const validStatuses = ["Created", "Assigned", "In Progress", "Completed"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status value" })
    }

    // Find the task
    const task = await Task.findById(id)

    if (!task) {
      return res.status(404).json({ message: "Task not found" })
    }

    // Check if user is authorized to update (either admin or assigned to task)
    const isAdmin = req.user.role === "Admin" || req.user.role === "Super Admin"
    const isAssigned = task.assignedUsers.some((user) => user.toString() === userId)

    if (!isAdmin && !isAssigned) {
      return res.status(403).json({ message: "Not authorized to update this task" })
    }

    // If user is assigned but not admin, they can only update to "In Progress" or "Completed"
    if (!isAdmin && isAssigned) {
      if (status === "Created" || status === "Assigned") {
        return res.status(403).json({ message: "Assigned users can only update status to In Progress or Completed" })
      }
    }

    // Update task status
    task.status = status
    task.updatedAt = Date.now()

    await task.save()

    res.status(200).json({
      message: "Task status updated successfully",
      task,
    })
  } catch (error) {
    console.error("Error updating task status:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Update task details (admin only)
export const updateTask = async (req, res) => {
  try {
    const { id } = req.params
    const { title, description, priority, dueDate, category, assignedUsers } = req.body

    // Find task by ID
    const task = await Task.findById(id)

    if (!task) {
      return res.status(404).json({ message: "Task not found" })
    }

    // Validate assigned users if provided
    if (assignedUsers) {
      const userCount = await User.countDocuments({
        _id: { $in: assignedUsers },
      })

      if (userCount !== assignedUsers.length) {
        return res.status(400).json({ message: "One or more assigned users do not exist" })
      }
    }

    // Update task fields
    if (title) task.title = title
    if (description) task.description = description
    if (priority) task.priority = priority
    if (dueDate) task.dueDate = dueDate
    if (category) task.category = category
    if (assignedUsers) task.assignedUsers = assignedUsers

    task.updatedAt = Date.now()

    // Auto-update status if needed (if users are assigned and status is Created)
    if (task.status === "Created" && task.assignedUsers.length > 0) {
      task.status = "Assigned"
    }

    const updatedTask = await task.save()

    res.status(200).json({
      message: "Task updated successfully",
      task: updatedTask,
    })
  } catch (error) {
    console.error("Error updating task:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// Delete task (admin only)
export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params

    const deletedTask = await Task.findByIdAndDelete(id)

    if (!deletedTask) {
      return res.status(404).json({ message: "Task not found" })
    }

    res.status(200).json({ message: "Task deleted successfully" })
  } catch (error) {
    console.error("Error deleting task:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
