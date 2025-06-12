import HostelInventory from "../models/HostelInventory.js"
import InventoryItemType from "../models/InventoryItemType.js"
import Hostel from "../models/Hostel.js"
import mongoose from "mongoose"

// @desc    Assign inventory items to a hostel
// @route   POST /api/inventory/hostel
// @access  Private/Admin
export const assignInventoryToHostel = async (req, res) => {
  try {
    const { hostelId, itemTypeId, allocatedCount } = req.body

    // Validate required fields
    if (!hostelId || !itemTypeId || allocatedCount === undefined) {
      return res.status(400).json({ message: "Hostel ID, item type ID, and allocated count are required" })
    }

    // Validate hostel exists
    const hostel = await Hostel.findById(hostelId)
    if (!hostel) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    // Validate item type exists
    const itemType = await InventoryItemType.findById(itemTypeId)
    if (!itemType) {
      return res.status(404).json({ message: "Inventory item type not found" })
    }

    // Check if allocation count is valid
    if (allocatedCount < 0) {
      return res.status(400).json({ message: "Allocated count must be a positive number" })
    }

    // Check if there's enough inventory available globally
    const existingAllocations = await HostelInventory.aggregate([{ $match: { itemTypeId: new mongoose.Types.ObjectId(itemTypeId) } }, { $group: { _id: null, totalAllocated: { $sum: "$allocatedCount" } } }])

    const totalAllocated = existingAllocations.length > 0 ? existingAllocations[0].totalAllocated : 0

    // Check if existing allocation exists for this hostel and item type
    const existingAllocation = await HostelInventory.findOne({
      hostelId,
      itemTypeId,
    })

    // Calculate how much more we can allocate
    const currentAllocation = existingAllocation ? existingAllocation.allocatedCount : 0
    const additionalAllocation = allocatedCount - currentAllocation

    if (totalAllocated + additionalAllocation > itemType.totalCount) {
      return res.status(400).json({
        message: `Cannot allocate ${allocatedCount} items. Only ${itemType.totalCount - totalAllocated + currentAllocation} available globally.`,
      })
    }

    let hostelInventory

    if (existingAllocation) {
      // Update existing allocation
      existingAllocation.allocatedCount = allocatedCount
      existingAllocation.availableCount = existingAllocation.availableCount + additionalAllocation
      hostelInventory = await existingAllocation.save()
    } else {
      // Create new allocation
      const newHostelInventory = new HostelInventory({
        hostelId,
        itemTypeId,
        allocatedCount,
        availableCount: allocatedCount,
      })
      hostelInventory = await newHostelInventory.save()
    }

    res.status(201).json(hostelInventory)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Get inventory items for a specific hostel
// @route   GET /api/inventory/hostel/:hostelId
// @access  Private
export const getHostelInventory = async (req, res) => {
  try {
    const { hostelId } = req.params

    // Validate hostel exists
    const hostel = await Hostel.findById(hostelId)
    if (!hostel) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    const inventory = await HostelInventory.find({ hostelId }).populate("itemTypeId", "name description").populate("hostelId", "name")

    res.status(200).json(inventory)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Get all hostel inventory items
// @route   GET /api/inventory/hostel
// @access  Private/Admin
export const getAllHostelInventory = async (req, res) => {
  const user = req.user
  try {
    const { page = 1, limit = 10, hostelId, itemTypeId } = req.query

    const query = {}
    if (hostelId) query.hostelId = hostelId
    if (itemTypeId) query.itemTypeId = itemTypeId

    if (user.hostel) query.hostelId = user.hostel._id

    const totalCount = await HostelInventory.countDocuments(query)
    const inventory = await HostelInventory.find(query)
      .populate("itemTypeId", "name description")
      .populate("hostelId", "name")
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

// @desc    Update hostel inventory allocation
// @route   PUT /api/inventory/hostel/:id
// @access  Private/Admin
export const updateHostelInventory = async (req, res) => {
  try {
    const { allocatedCount } = req.body
    const { id } = req.params

    if (allocatedCount === undefined) {
      return res.status(400).json({ message: "Allocated count is required" })
    }

    if (allocatedCount < 0) {
      return res.status(400).json({ message: "Allocated count must be a positive number" })
    }

    const hostelInventory = await HostelInventory.findById(id)
    if (!hostelInventory) {
      return res.status(404).json({ message: "Hostel inventory record not found" })
    }

    // Check if there's enough inventory available globally
    const itemType = await InventoryItemType.findById(hostelInventory.itemTypeId)
    if (!itemType) {
      return res.status(404).json({ message: "Inventory item type not found" })
    }

    const existingAllocations = await HostelInventory.aggregate([
      {
        $match: {
          itemTypeId: hostelInventory.itemTypeId,
          _id: { $ne: new mongoose.Types.ObjectId(id) },
        },
      },
      { $group: { _id: null, totalAllocated: { $sum: "$allocatedCount" } } },
    ])

    const totalAllocatedElsewhere = existingAllocations.length > 0 ? existingAllocations[0].totalAllocated : 0

    if (totalAllocatedElsewhere + allocatedCount > itemType.totalCount) {
      return res.status(400).json({
        message: `Cannot allocate ${allocatedCount} items. Only ${itemType.totalCount - totalAllocatedElsewhere} available globally.`,
      })
    }

    // Calculate how many items are currently in use
    const itemsInUse = hostelInventory.allocatedCount - hostelInventory.availableCount

    if (allocatedCount < itemsInUse) {
      return res.status(400).json({
        message: `Cannot reduce allocation below ${itemsInUse} as these items are currently assigned to students.`,
      })
    }

    // Update the allocation
    hostelInventory.allocatedCount = allocatedCount
    hostelInventory.availableCount = allocatedCount - itemsInUse

    const updatedHostelInventory = await hostelInventory.save()
    res.status(200).json(updatedHostelInventory)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Delete hostel inventory allocation
// @route   DELETE /api/inventory/hostel/:id
// @access  Private/Admin
export const deleteHostelInventory = async (req, res) => {
  try {
    const { id } = req.params

    const hostelInventory = await HostelInventory.findById(id)
    if (!hostelInventory) {
      return res.status(404).json({ message: "Hostel inventory record not found" })
    }

    // Check if there are any items currently assigned to students
    const itemsInUse = hostelInventory.allocatedCount - hostelInventory.availableCount
    if (itemsInUse > 0) {
      return res.status(400).json({
        message: `Cannot delete allocation as ${itemsInUse} items are currently assigned to students.`,
      })
    }

    await HostelInventory.findByIdAndDelete(id)
    res.status(200).json({ message: "Hostel inventory allocation removed" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Get inventory summary by hostel
// @route   GET /api/inventory/hostel/summary
// @access  Private/Admin
export const getInventorySummaryByHostel = async (req, res) => {
  try {
    const summary = await HostelInventory.aggregate([
      {
        $lookup: {
          from: "hostels",
          localField: "hostelId",
          foreignField: "_id",
          as: "hostel",
        },
      },
      {
        $unwind: "$hostel",
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
          _id: "$hostelId",
          hostelName: { $first: "$hostel.name" },
          totalAllocated: { $sum: "$allocatedCount" },
          totalAvailable: { $sum: "$availableCount" },
          items: {
            $push: {
              itemTypeId: "$itemTypeId",
              itemName: "$itemType.name",
              allocated: "$allocatedCount",
              available: "$availableCount",
            },
          },
        },
      },
    ])

    res.status(200).json(summary)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
