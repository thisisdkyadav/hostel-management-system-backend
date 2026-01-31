import { inventoryItemTypeService } from "../services/inventoryItemType.service.js"
import { asyncHandler } from "../../../utils/controllerHelpers.js"

/**
 * Helper: Error format with error field
 */
const sendWithError = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// @desc    Create a new inventory item type
// @route   POST /api/inventory/types
// @access  Private/Admin
export const createInventoryItemType = asyncHandler(async (req, res) => {
  const result = await inventoryItemTypeService.createInventoryItemType(req.body)
  sendWithError(res, result)
})

// @desc    Get all inventory item types
// @route   GET /api/inventory/types
// @access  Private
export const getInventoryItemTypes = asyncHandler(async (req, res) => {
  const result = await inventoryItemTypeService.getInventoryItemTypes(req.query)
  sendWithError(res, result)
})

// @desc    Get inventory item type by ID
// @route   GET /api/inventory/types/:id
// @access  Private
export const getInventoryItemTypeById = asyncHandler(async (req, res) => {
  const result = await inventoryItemTypeService.getInventoryItemTypeById(req.params.id)
  sendWithError(res, result)
})

// @desc    Update inventory item type
// @route   PUT /api/inventory/types/:id
// @access  Private/Admin
export const updateInventoryItemType = asyncHandler(async (req, res) => {
  const result = await inventoryItemTypeService.updateInventoryItemType(req.params.id, req.body)
  sendWithError(res, result)
})

// @desc    Delete inventory item type
// @route   DELETE /api/inventory/types/:id
// @access  Private/Admin
export const deleteInventoryItemType = asyncHandler(async (req, res) => {
  const result = await inventoryItemTypeService.deleteInventoryItemType(req.params.id)
  sendWithError(res, result)
})

// @desc    Update inventory item type count
// @route   PATCH /api/inventory/types/:id/count
// @access  Private/Admin
export const updateInventoryItemTypeCount = asyncHandler(async (req, res) => {
  const result = await inventoryItemTypeService.updateInventoryItemTypeCount(req.params.id, req.body)
  sendWithError(res, result)
})
