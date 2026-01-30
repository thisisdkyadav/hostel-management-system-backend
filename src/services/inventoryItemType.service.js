import InventoryItemType from "../../models/InventoryItemType.js"

class InventoryItemTypeService {
  async createInventoryItemType(data) {
    try {
      const { name, description, totalCount } = data

      if (!name) {
        return { success: false, statusCode: 400, message: "Name is required" }
      }

      // Check if item type already exists
      const existingItemType = await InventoryItemType.findOne({ name })
      if (existingItemType) {
        return { success: false, statusCode: 400, message: "Inventory item type already exists" }
      }

      // Create new inventory item type
      const inventoryItemType = new InventoryItemType({
        name,
        description,
        totalCount: totalCount || 0,
      })

      const savedItemType = await inventoryItemType.save()

      return { success: true, statusCode: 201, data: savedItemType }
    } catch (error) {
      console.error(error)
      return { success: false, statusCode: 500, message: "Server error", error: error.message }
    }
  }

  async getInventoryItemTypes(query) {
    try {
      const { page = 1, limit = 10, search } = query

      const queryObj = {}
      if (search) {
        queryObj.name = { $regex: search, $options: "i" }
      }

      const totalCount = await InventoryItemType.countDocuments(queryObj)
      const inventoryItemTypes = await InventoryItemType.find(queryObj)
        .sort({ name: 1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))

      return {
        success: true,
        statusCode: 200,
        data: {
          data: inventoryItemTypes,
          pagination: {
            totalCount,
            totalPages: Math.ceil(totalCount / parseInt(limit)),
            currentPage: parseInt(page),
            limit: parseInt(limit),
          },
        },
      }
    } catch (error) {
      console.error(error)
      return { success: false, statusCode: 500, message: "Server error", error: error.message }
    }
  }

  async getInventoryItemTypeById(id) {
    try {
      const inventoryItemType = await InventoryItemType.findById(id)

      if (!inventoryItemType) {
        return { success: false, statusCode: 404, message: "Inventory item type not found" }
      }

      return { success: true, statusCode: 200, data: inventoryItemType }
    } catch (error) {
      console.error(error)
      return { success: false, statusCode: 500, message: "Server error", error: error.message }
    }
  }

  async updateInventoryItemType(id, data) {
    try {
      const { name, description, totalCount } = data

      const inventoryItemType = await InventoryItemType.findById(id)
      if (!inventoryItemType) {
        return { success: false, statusCode: 404, message: "Inventory item type not found" }
      }

      // Check if name is being changed and if it already exists
      if (name && name !== inventoryItemType.name) {
        const existingItemType = await InventoryItemType.findOne({ name })
        if (existingItemType) {
          return { success: false, statusCode: 400, message: "An inventory item type with this name already exists" }
        }
      }

      const updateData = {}
      if (name !== undefined) updateData.name = name
      if (description !== undefined) updateData.description = description
      if (totalCount !== undefined) updateData.totalCount = totalCount

      const updatedInventoryItemType = await InventoryItemType.findByIdAndUpdate(id, updateData, { new: true })

      return { success: true, statusCode: 200, data: updatedInventoryItemType }
    } catch (error) {
      console.error(error)
      return { success: false, statusCode: 500, message: "Server error", error: error.message }
    }
  }

  async deleteInventoryItemType(id) {
    try {
      const inventoryItemType = await InventoryItemType.findById(id)
      if (!inventoryItemType) {
        return { success: false, statusCode: 404, message: "Inventory item type not found" }
      }

      // Check if this item type is being used in hostel inventory
      const HostelInventory = await import("../../models/HostelInventory.js").then((module) => module.default)
      const hostelInventoryCount = await HostelInventory.countDocuments({ itemTypeId: id })

      if (hostelInventoryCount > 0) {
        return { success: false, statusCode: 400, message: "Cannot delete inventory item type that is assigned to hostels" }
      }

      // Check if this item type is being used in student inventory
      const StudentInventory = await import("../../models/StudentInventory.js").then((module) => module.default)
      const studentInventoryCount = await StudentInventory.countDocuments({ itemTypeId: id })

      if (studentInventoryCount > 0) {
        return { success: false, statusCode: 400, message: "Cannot delete inventory item type that is assigned to students" }
      }

      await InventoryItemType.findByIdAndDelete(id)
      return { success: true, statusCode: 200, data: { message: "Inventory item type removed" } }
    } catch (error) {
      console.error(error)
      return { success: false, statusCode: 500, message: "Server error", error: error.message }
    }
  }

  async updateInventoryItemTypeCount(id, data) {
    try {
      const { totalCount } = data

      if (totalCount === undefined) {
        return { success: false, statusCode: 400, message: "Total count is required" }
      }

      const inventoryItemType = await InventoryItemType.findById(id)
      if (!inventoryItemType) {
        return { success: false, statusCode: 404, message: "Inventory item type not found" }
      }

      inventoryItemType.totalCount = totalCount
      const updatedInventoryItemType = await inventoryItemType.save()

      return { success: true, statusCode: 200, data: updatedInventoryItemType }
    } catch (error) {
      console.error(error)
      return { success: false, statusCode: 500, message: "Server error", error: error.message }
    }
  }
}

export const inventoryItemTypeService = new InventoryItemTypeService()
