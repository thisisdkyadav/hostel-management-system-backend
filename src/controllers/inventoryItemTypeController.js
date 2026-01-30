import { inventoryItemTypeService } from "../services/inventoryItemType.service.js"

// @desc    Create a new inventory item type
// @route   POST /api/inventory/types
// @access  Private/Admin
export const createInventoryItemType = async (req, res) => {
  const result = await inventoryItemTypeService.createInventoryItemType(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// @desc    Get all inventory item types
// @route   GET /api/inventory/types
// @access  Private
export const getInventoryItemTypes = async (req, res) => {
  const result = await inventoryItemTypeService.getInventoryItemTypes(req.query)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// @desc    Get inventory item type by ID
// @route   GET /api/inventory/types/:id
// @access  Private
export const getInventoryItemTypeById = async (req, res) => {
  const result = await inventoryItemTypeService.getInventoryItemTypeById(req.params.id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// @desc    Update inventory item type
// @route   PUT /api/inventory/types/:id
// @access  Private/Admin
export const updateInventoryItemType = async (req, res) => {
  const result = await inventoryItemTypeService.updateInventoryItemType(req.params.id, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// @desc    Delete inventory item type
// @route   DELETE /api/inventory/types/:id
// @access  Private/Admin
export const deleteInventoryItemType = async (req, res) => {
  const result = await inventoryItemTypeService.deleteInventoryItemType(req.params.id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// @desc    Update inventory item type count
// @route   PATCH /api/inventory/types/:id/count
// @access  Private/Admin
export const updateInventoryItemTypeCount = async (req, res) => {
  const result = await inventoryItemTypeService.updateInventoryItemTypeCount(req.params.id, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}
