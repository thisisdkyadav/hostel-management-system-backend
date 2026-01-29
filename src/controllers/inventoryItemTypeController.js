import InventoryItemType from "../../models/InventoryItemType.js"

// @desc    Create a new inventory item type
// @route   POST /api/inventory/types
// @access  Private/Admin
export const createInventoryItemType = async (req, res) => {
  try {
    const { name, description, totalCount } = req.body

    if (!name) {
      return res.status(400).json({ message: "Name is required" })
    }

    // Check if item type already exists
    const existingItemType = await InventoryItemType.findOne({ name })
    if (existingItemType) {
      return res.status(400).json({ message: "Inventory item type already exists" })
    }

    // Create new inventory item type
    const inventoryItemType = new InventoryItemType({
      name,
      description,
      totalCount: totalCount || 0,
    })

    const savedItemType = await inventoryItemType.save()

    res.status(201).json(savedItemType)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Get all inventory item types
// @route   GET /api/inventory/types
// @access  Private
export const getInventoryItemTypes = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query

    const query = {}
    if (search) {
      query.name = { $regex: search, $options: "i" }
    }

    const totalCount = await InventoryItemType.countDocuments(query)
    const inventoryItemTypes = await InventoryItemType.find(query)
      .sort({ name: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))

    res.status(200).json({
      data: inventoryItemTypes,
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

// @desc    Get inventory item type by ID
// @route   GET /api/inventory/types/:id
// @access  Private
export const getInventoryItemTypeById = async (req, res) => {
  try {
    const inventoryItemType = await InventoryItemType.findById(req.params.id)

    if (!inventoryItemType) {
      return res.status(404).json({ message: "Inventory item type not found" })
    }

    res.status(200).json(inventoryItemType)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Update inventory item type
// @route   PUT /api/inventory/types/:id
// @access  Private/Admin
export const updateInventoryItemType = async (req, res) => {
  try {
    const { name, description, totalCount } = req.body
    const { id } = req.params

    const inventoryItemType = await InventoryItemType.findById(id)
    if (!inventoryItemType) {
      return res.status(404).json({ message: "Inventory item type not found" })
    }

    // Check if name is being changed and if it already exists
    if (name && name !== inventoryItemType.name) {
      const existingItemType = await InventoryItemType.findOne({ name })
      if (existingItemType) {
        return res.status(400).json({ message: "An inventory item type with this name already exists" })
      }
    }

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (totalCount !== undefined) updateData.totalCount = totalCount

    const updatedInventoryItemType = await InventoryItemType.findByIdAndUpdate(id, updateData, { new: true })

    res.status(200).json(updatedInventoryItemType)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Delete inventory item type
// @route   DELETE /api/inventory/types/:id
// @access  Private/Admin
export const deleteInventoryItemType = async (req, res) => {
  try {
    const { id } = req.params

    const inventoryItemType = await InventoryItemType.findById(id)
    if (!inventoryItemType) {
      return res.status(404).json({ message: "Inventory item type not found" })
    }

    // Check if this item type is being used in hostel inventory
    const HostelInventory = await import("../models/HostelInventory.js").then((module) => module.default)
    const hostelInventoryCount = await HostelInventory.countDocuments({ itemTypeId: id })

    if (hostelInventoryCount > 0) {
      return res.status(400).json({ message: "Cannot delete inventory item type that is assigned to hostels" })
    }

    // Check if this item type is being used in student inventory
    const StudentInventory = await import("../models/StudentInventory.js").then((module) => module.default)
    const studentInventoryCount = await StudentInventory.countDocuments({ itemTypeId: id })

    if (studentInventoryCount > 0) {
      return res.status(400).json({ message: "Cannot delete inventory item type that is assigned to students" })
    }

    await InventoryItemType.findByIdAndDelete(id)
    res.status(200).json({ message: "Inventory item type removed" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// @desc    Update inventory item type count
// @route   PATCH /api/inventory/types/:id/count
// @access  Private/Admin
export const updateInventoryItemTypeCount = async (req, res) => {
  try {
    const { totalCount } = req.body
    const { id } = req.params

    if (totalCount === undefined) {
      return res.status(400).json({ message: "Total count is required" })
    }

    const inventoryItemType = await InventoryItemType.findById(id)
    if (!inventoryItemType) {
      return res.status(404).json({ message: "Inventory item type not found" })
    }

    inventoryItemType.totalCount = totalCount
    const updatedInventoryItemType = await inventoryItemType.save()

    res.status(200).json(updatedInventoryItemType)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
