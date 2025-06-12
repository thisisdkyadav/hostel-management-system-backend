import express from "express"
import { createInventoryItemType, getInventoryItemTypes, getInventoryItemTypeById, updateInventoryItemType, deleteInventoryItemType, updateInventoryItemTypeCount } from "../controllers/inventoryItemTypeController.js"
import { assignInventoryToHostel, getHostelInventory, getAllHostelInventory, updateHostelInventory, deleteHostelInventory, getInventorySummaryByHostel } from "../controllers/hostelInventoryController.js"
import { assignInventoryToStudent, getStudentInventory, getAllStudentInventory, returnStudentInventory, updateInventoryStatus, getInventorySummaryByStudent, getInventorySummaryByItemType } from "../controllers/studentInventoryController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
const router = express.Router()

router.use(authenticate)

// Item Type Routes
router
  .route("/types")
  .post(authorizeRoles(["Admin", "Super Admin"]), createInventoryItemType)
  .get(authorizeRoles(["Admin", "Super Admin"]), getInventoryItemTypes)

router
  .route("/types/:id")
  .get(authorizeRoles(["Admin", "Super Admin"]), getInventoryItemTypeById)
  .put(authorizeRoles(["Admin", "Super Admin"]), updateInventoryItemType)
  .delete(authorizeRoles(["Admin", "Super Admin"]), deleteInventoryItemType)

router.route("/types/:id/count").patch(authorizeRoles(["Admin", "Super Admin"]), updateInventoryItemTypeCount)

// Hostel Inventory Routes
router
  .route("/hostel")
  .post(authorizeRoles(["Admin", "Super Admin"]), assignInventoryToHostel)
  .get(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getAllHostelInventory)

router.route("/hostel/summary").get(authorizeRoles(["Admin", "Super Admin"]), getInventorySummaryByHostel)

// router.route("/hostel/:hostelId").get(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getHostelInventory)

router
  .route("/hostel/item/:id")
  .put(authorizeRoles(["Admin", "Super Admin"]), updateHostelInventory)
  .delete(authorizeRoles(["Admin", "Super Admin"]), deleteHostelInventory)

// Student Inventory Routes
router
  .route("/student")
  .post(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), assignInventoryToStudent)
  .get(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getAllStudentInventory)

router.route("/student/summary/student").get(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getInventorySummaryByStudent)

router.route("/student/summary/item").get(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getInventorySummaryByItemType)

router.route("/student/:studentProfileId").get(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getStudentInventory)

router.route("/student/:id/return").put(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), returnStudentInventory)

router.route("/student/:id/status").put(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), updateInventoryStatus)

export default router
