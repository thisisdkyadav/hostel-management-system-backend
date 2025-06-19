import StudentInventory from "../models/StudentInventory.js"
import HostelInventory from "../models/HostelInventory.js"
import StudentProfile from "../models/StudentProfile.js"
import mongoose from "mongoose"

// @desc    Assign inventory items to a student
// @route   POST /api/inventory/student
// @access  Private/Warden/Admin
export const assignInventoryToStudent = async (req, res) => {
  try {
    const { studentProfileId, hostelInventoryId, itemTypeId, count, condition, notes } = req.body

    // Validate required fields
    if (!studentProfileId || !hostelInventoryId || !itemTypeId) {
      return res.status(400).json({ message: "Student profile ID, hostel inventory ID, and item type ID are required" })
    }

    // Validate student exists
    const student = await StudentProfile.findById(studentProfileId)
    if (!student) {
      return res.status(404).json({ message: "Student not found" })
    }

    // Validate hostel inventory exists
    const hostelInventory = await HostelInventory.findById(hostelInventoryId)
    if (!hostelInventory) {
      return res.status(404).json({ message: "Hostel inventory record not found" })
    }

    // Validate item type matches
    if (hostelInventory.itemTypeId.toString() !== itemTypeId) {
      return res.status(400).json({ message: "Item type ID does not match the hostel inventory record" })
    }

    // Validate count
    const itemCount = count || 1
    if (itemCount <= 0) {
      return res.status(400).json({ message: "Count must be a positive number" })
    }

    // Check if there's enough inventory available in the hostel
    if (hostelInventory.availableCount < itemCount) {
      return res.status(400).json({ message: `Not enough items available. Only ${hostelInventory.availableCount} items available.` })
    }

    // Create student inventory record
    const newStudentInventory = new StudentInventory({
      studentProfileId,
      hostelInventoryId,
      itemTypeId,
      count: itemCount,
      condition: condition || "Good",
      notes,
      issuedBy: req.user._id,
    })

    const studentInventory = await newStudentInventory.save()

    // Update hostel inventory available count
    hostelInventory.availableCount -= itemCount
    await hostelInventory.save()

    // Return the created record with populated data
    const populatedInventory = await StudentInventory.findById(studentInventory._id)
      .populate("studentProfileId", "rollNumber")
      .populate({
        path: "studentProfileId",
        populate: {
          path: "userId",
          select: "name email",
        },
      })
      .populate("itemTypeId", "name description")
      .populate("issuedBy", "name")

    res.status(201).json(populatedInventory)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Get inventory items for a specific student
// @route   GET /api/inventory/student/:studentProfileId
// @access  Private
export const getStudentInventory = async (req, res) => {
  try {
    const { studentProfileId } = req.params

    // Validate student exists
    const student = await StudentProfile.findById(studentProfileId)
    if (!student) {
      return res.status(404).json({ message: "Student not found" })
    }

    const inventory = await StudentInventory.find({
      studentProfileId,
      status: { $ne: "Returned" }, // Only show active inventory
    })
      .populate("itemTypeId", "name description")
      .populate("hostelInventoryId")
      .populate("issuedBy", "name")
      .sort({ issueDate: -1 })

    res.status(200).json(inventory)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Get all student inventory items with filtering
// @route   GET /api/inventory/student
// @access  Private/Admin/Warden
export const getAllStudentInventory = async (req, res) => {
  const user = req.user
  try {
    const { page = 1, limit = 10, studentProfileId, itemTypeId, hostelId, status = "All", rollNumber, sortBy = "issueDate", sortOrder = "desc" } = req.query

    const query = {}

    if (studentProfileId) query.studentProfileId = studentProfileId
    if (itemTypeId) query.itemTypeId = itemTypeId
    if (status && status !== "All") query.status = status

    // If roll number is provided, we need to find the student profile first
    if (rollNumber) {
      const studentProfile = await StudentProfile.findOne({ rollNumber: { $regex: rollNumber, $options: "i" } })
      if (studentProfile) {
        query.studentProfileId = studentProfile._id
      } else {
        // If no student found with this roll number, return empty result
        return res.status(200).json({
          data: [],
          pagination: {
            totalCount: 0,
            totalPages: 0,
            currentPage: parseInt(page),
            limit: parseInt(limit),
          },
        })
      }
    }

    const hostel_id = user.hostel ? user.hostel._id : hostelId

    // If hostel ID is provided, we need to find related hostel inventory records
    if (hostel_id) {
      const hostelInventories = await HostelInventory.find({ hostelId: hostel_id })
      if (hostelInventories && hostelInventories.length > 0) {
        query.hostelInventoryId = { $in: hostelInventories.map((hi) => hi._id) }
      } else {
        // If no hostel inventory found for this hostel, return empty result
        return res.status(200).json({
          data: [],
          pagination: {
            totalCount: 0,
            totalPages: 0,
            currentPage: parseInt(page),
            limit: parseInt(limit),
          },
        })
      }
    }

    const totalCount = await StudentInventory.countDocuments(query)

    // Determine sort direction
    const sortDirection = sortOrder === "desc" ? -1 : 1

    const inventory = await StudentInventory.find(query)
      .populate("itemTypeId", "name description")
      .populate("studentProfileId", "rollNumber")
      .populate({
        path: "studentProfileId",
        populate: {
          path: "userId",
          select: "name email",
        },
      })
      .populate("hostelInventoryId")
      .populate("issuedBy", "name")
      .sort({ [sortBy]: sortDirection })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))

    res.status(200).json({
      data: inventory,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit),
      },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Return inventory items from a student
// @route   PUT /api/inventory/student/:id/return
// @access  Private/Warden/Admin
export const returnStudentInventory = async (req, res) => {
  try {
    const { id } = req.params
    const { condition, notes } = req.body

    const studentInventory = await StudentInventory.findById(id)
    if (!studentInventory) {
      return res.status(404).json({ message: "Student inventory record not found" })
    }

    if (studentInventory.status === "Returned") {
      return res.status(400).json({ message: "This item has already been returned" })
    }

    // Update the student inventory record
    studentInventory.status = "Returned"
    studentInventory.returnDate = new Date()
    studentInventory.returnedBy = req.user._id

    if (condition) {
      studentInventory.condition = condition
    }

    if (notes) {
      studentInventory.notes = notes
    }

    await studentInventory.save()

    // Update hostel inventory available count
    const hostelInventory = await HostelInventory.findById(studentInventory.hostelInventoryId)
    if (hostelInventory) {
      hostelInventory.availableCount += studentInventory.count
      await hostelInventory.save()
    }

    // Return the updated record with populated data
    const populatedInventory = await StudentInventory.findById(id)
      .populate("itemTypeId", "name description")
      .populate("studentProfileId", "rollNumber")
      .populate({
        path: "studentProfileId",
        populate: {
          path: "userId",
          select: "name email",
        },
      })
      .populate("issuedBy", "name")
      .populate("returnedBy", "name")

    res.status(200).json(populatedInventory)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Mark inventory item as damaged or lost
// @route   PUT /api/inventory/student/:id/status
// @access  Private/Warden/Admin
export const updateInventoryStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status, condition, notes } = req.body

    if (!status || !["Damaged", "Lost", "Issued"].includes(status)) {
      return res.status(400).json({ message: "Valid status (Damaged, Lost, or Issued) is required" })
    }

    if (!condition || !["Excellent", "Good", "Fair", "Poor"].includes(condition)) {
      return res.status(400).json({ message: "Valid condition (Excellent, Good, Fair, or Poor) is required" })
    }

    const studentInventory = await StudentInventory.findById(id)
    if (!studentInventory) {
      return res.status(404).json({ message: "Student inventory record not found" })
    }

    if (studentInventory.status === "Returned") {
      return res.status(400).json({ message: "Cannot update status of returned items" })
    }

    // Update the student inventory record
    studentInventory.status = status

    if (condition) {
      studentInventory.condition = condition
    }

    if (notes) {
      studentInventory.notes = notes
    }

    await studentInventory.save()

    // Return the updated record with populated data
    const populatedInventory = await StudentInventory.findById(id)
      .populate("itemTypeId", "name description")
      .populate("studentProfileId", "rollNumber")
      .populate({
        path: "studentProfileId",
        populate: {
          path: "userId",
          select: "name email",
        },
      })
      .populate("issuedBy", "name")

    res.status(200).json(populatedInventory)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Get inventory summary by student
// @route   GET /api/inventory/student/summary/student
// @access  Private/Admin/Warden
export const getInventorySummaryByStudent = async (req, res) => {
  try {
    const { hostelId } = req.query

    const matchStage = { status: "Issued" }

    // If hostel ID is provided, filter by hostel
    if (hostelId) {
      const hostelInventories = await HostelInventory.find({ hostelId })
      if (hostelInventories && hostelInventories.length > 0) {
        matchStage.hostelInventoryId = {
          $in: hostelInventories.map((hi) => hi._id),
        }
      } else {
        return res.status(200).json([])
      }
    }

    const summary = await StudentInventory.aggregate([
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: "studentprofiles",
          localField: "studentProfileId",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $unwind: "$student",
      },
      {
        $lookup: {
          from: "users",
          localField: "student.userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $lookup: {
          from: "inventoryitemtypes",
          localField: "itemTypeId",
          foreignField: "_id",
          as: "itemType",
        },
      },
      {
        $unwind: "$itemType",
      },
      {
        $group: {
          _id: "$studentProfileId",
          studentName: { $first: "$user.name" },
          rollNumber: { $first: "$student.rollNumber" },
          totalItems: { $sum: "$count" },
          items: {
            $push: {
              id: "$_id",
              itemTypeId: "$itemTypeId",
              itemName: "$itemType.name",
              count: "$count",
              issueDate: "$issueDate",
              status: "$status",
              condition: "$condition",
            },
          },
        },
      },
      {
        $sort: { rollNumber: 1 },
      },
    ])

    res.status(200).json(summary)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Get inventory summary by item type
// @route   GET /api/inventory/student/summary/item
// @access  Private/Admin/Warden
export const getInventorySummaryByItemType = async (req, res) => {
  try {
    const { hostelId } = req.query

    const matchStage = { status: "Issued" }

    // If hostel ID is provided, filter by hostel
    if (hostelId) {
      const hostelInventories = await HostelInventory.find({ hostelId })
      if (hostelInventories && hostelInventories.length > 0) {
        matchStage.hostelInventoryId = {
          $in: hostelInventories.map((hi) => hi._id),
        }
      } else {
        return res.status(200).json([])
      }
    }

    const summary = await StudentInventory.aggregate([
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: "inventoryitemtypes",
          localField: "itemTypeId",
          foreignField: "_id",
          as: "itemType",
        },
      },
      {
        $unwind: "$itemType",
      },
      {
        $group: {
          _id: "$itemTypeId",
          itemName: { $first: "$itemType.name" },
          totalAssigned: { $sum: "$count" },
          studentCount: { $addToSet: "$studentProfileId" },
        },
      },
      {
        $project: {
          _id: 1,
          itemName: 1,
          totalAssigned: 1,
          studentCount: { $size: "$studentCount" },
        },
      },
      {
        $sort: { itemName: 1 },
      },
    ])

    res.status(200).json(summary)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
