import StudentProfile from "../../models/StudentProfile.js"
import User from "../../models/User.js"
import FamilyMember from "../../models/FamilyMember.js"
import { getConfigWithDefault } from "../../utils/configDefaults.js"
import Health from "../../models/Health.js"

// Get only editable profile fields
export const getEditableProfile = async (req, res) => {
  try {
    // Get the user ID from authenticated user
    const userId = req.user._id

    // Get student editable fields from configuration
    const config = await getConfigWithDefault("studentEditableFields")
    const editableFields = config?.value || ["profileImage", "dateOfBirth"]

    // Find the student profile
    const studentProfile = await StudentProfile.findOne({ userId }).populate("userId", "name email profileImage phone")

    if (!studentProfile) {
      return res.status(404).json({ success: false, message: "Student profile not found" })
    }

    // Create a response with only the editable fields
    const editableProfile = {}

    const health = await Health.findOne({ userId })

    // Extract fields based on configuration
    editableFields.forEach((field) => {
      switch (field) {
        // User model fields
        case "name":
          editableProfile.name = studentProfile.userId?.name || ""
          break
        case "profileImage":
          editableProfile.profileImage = studentProfile.userId?.profileImage || ""
          break

        // StudentProfile model fields
        case "gender":
          editableProfile.gender = studentProfile.gender || ""
          break
        case "dateOfBirth":
          editableProfile.dateOfBirth = studentProfile.dateOfBirth ? studentProfile.dateOfBirth.toISOString().split("T")[0] : ""
          break
        case "address":
          editableProfile.address = studentProfile.address || ""
          break
        case "familyMembers":
          editableProfile.familyMembers = true
          break
        case "phone":
          editableProfile.phone = studentProfile.userId.phone || ""
          break
        case "emergencyContact":
          editableProfile.guardian = studentProfile.guardian || ""
          editableProfile.guardianPhone = studentProfile.guardianPhone || ""
          editableProfile.guardianEmail = studentProfile.guardianEmail || ""
          break
        case "bloodGroup":
          editableProfile.bloodGroup = health?.bloodGroup || ""
          break
        case "admissionDate":
          editableProfile.admissionDate = studentProfile.admissionDate ? studentProfile.admissionDate.toISOString().split("T")[0] : ""
          break
      }
    })
    console.log("editableProfile", editableProfile)

    res.status(200).json({
      success: true,
      data: editableProfile,
      editableFields,
    })
  } catch (error) {
    console.error("Error fetching editable profile fields:", error)
    res.status(500).json({ success: false, message: "Failed to fetch editable profile fields", error: error.message })
  }
}

// Update student profile
export const updateStudentProfile = async (req, res) => {
  try {
    // Get the user ID from authenticated user
    const userId = req.user._id

    // Get student editable fields from configuration
    const config = await getConfigWithDefault("studentEditableFields")
    const editableFields = config?.value || ["profileImage", "dateOfBirth"] // Default if config not found

    // Find the student profile
    const studentProfile = await StudentProfile.findOne({ userId })
    if (!studentProfile) {
      return res.status(404).json({ success: false, message: "Student profile not found" })
    }

    // Get user for profile update
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" })
    }

    // Filter request body to only include editable fields
    const updates = {}
    const userUpdates = {}

    // Process each field in the request
    Object.keys(req.body).forEach((field) => {
      console.log("field", field)

      // Skip null or undefined values
      if (req.body[field] === null || req.body[field] === undefined) return
      console.log("req.body[field]", req.body[field])

      switch (field) {
        // User model fields
        case "name":
          if (editableFields.includes("name")) {
            userUpdates.name = req.body.name
          }
          break
        case "profileImage":
          if (editableFields.includes("profileImage")) {
            userUpdates.profileImage = req.body.profileImage
          }
          break
        case "phone":
          if (editableFields.includes("phone")) {
            userUpdates.phone = req.body.phone
          }
          break

        // StudentProfile model fields
        case "gender":
          if (editableFields.includes("gender") && ["Male", "Female", "Other"].includes(req.body.gender)) {
            updates.gender = req.body.gender
          }
          break
        case "dateOfBirth":
          if (editableFields.includes("dateOfBirth")) {
            try {
              // Validate date format
              const date = new Date(req.body.dateOfBirth)
              if (!isNaN(date.getTime())) {
                updates.dateOfBirth = date
              }
            } catch (err) {
              // Invalid date, ignore
            }
          }
          break
        case "address":
          if (editableFields.includes("address")) {
            updates.address = req.body.address
          }
          break
        case "emergencyContact":
          if (editableFields.includes("emergencyContact")) {
            console.log("req.body.emergencyContact", req.body.emergencyContact)
            updates.guardian = req.body.emergencyContact.guardian
            updates.guardianPhone = req.body.emergencyContact.guardianPhone
            updates.guardianEmail = req.body.emergencyContact.guardianEmail
          }
          break
        case "bloodGroup":
          if (editableFields.includes("bloodGroup")) {
            updates.bloodGroup = req.body.bloodGroup
          }
          break
        case "admissionDate":
          if (editableFields.includes("admissionDate")) {
            updates.admissionDate = req.body.admissionDate
          }
          break
      }
    })

    // Update health if bloodGroup is provided
    if (updates.bloodGroup) {
      await Health.updateOne({ userId }, { $set: { bloodGroup: updates.bloodGroup } })
    }

    // Update student profile if there are changes
    if (Object.keys(updates).length > 0) {
      await StudentProfile.updateOne({ _id: studentProfile._id }, { $set: updates })
    }

    // Update user if there are changes
    if (Object.keys(userUpdates).length > 0) {
      await User.updateOne({ _id: userId }, { $set: userUpdates })
    }

    // If no updates were made
    if (Object.keys(updates).length === 0 && Object.keys(userUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid updates provided or you don't have permission to update these fields",
        editableFields,
      })
    }

    // Fetch updated student profile with user details
    const updatedProfile = await StudentProfile.getFullStudentData(userId)

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedProfile,
      editableFields,
    })
  } catch (error) {
    console.error("Error updating student profile:", error)
    res.status(500).json({ success: false, message: "Failed to update profile", error: error.message })
  }
}

// Get student profile
export const getStudentProfile = async (req, res) => {
  try {
    // Get the user ID from authenticated user
    const userId = req.user._id

    // Get student profile with all details
    const profile = await StudentProfile.getFullStudentData(userId)

    if (!profile) {
      return res.status(404).json({ success: false, message: "Student profile not found" })
    }

    // Get editable fields from configuration
    const config = await getConfigWithDefault("studentEditableFields")
    const editableFields = config?.value || ["profileImage", "dateOfBirth"]

    res.status(200).json({
      success: true,
      data: profile,
      editableFields,
    })
  } catch (error) {
    console.error("Error fetching student profile:", error)
    res.status(500).json({ success: false, message: "Failed to fetch profile", error: error.message })
  }
}

export const getFamilyMembers = async (req, res) => {
  const userId = req.user._id
  try {
    const familyMembers = await FamilyMember.find({ userId })
    res.status(200).json({ message: "Family members fetched successfully", data: familyMembers })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const addFamilyMember = async (req, res) => {
  const userId = req.user._id
  const { name, relationship, phone, email, address } = req.body
  try {
    const familyMember = await FamilyMember.create({ userId, name, relationship, phone, email, address })
    res.status(201).json({ message: "Family member added successfully", data: familyMember })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const updateFamilyMember = async (req, res) => {
  const userId = req.user._id
  const { name, relationship, phone, email, address } = req.body
  try {
    const familyMember = await FamilyMember.findById(req.params.id)
    if (!familyMember) {
      return res.status(404).json({ message: "Family member not found" })
    }
    if (familyMember.userId.toString() !== userId) {
      return res.status(403).json({ message: "You don't have permission to update this family member" })
    }
    const updatedFamilyMember = await FamilyMember.findByIdAndUpdate(req.params.id, { name, relationship, phone, email, address }, { new: true })
    res.status(200).json({ message: "Family member updated successfully", data: updatedFamilyMember })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const deleteFamilyMember = async (req, res) => {
  const userId = req.user._id
  try {
    const familyMember = await FamilyMember.findById(req.params.id)
    if (!familyMember) {
      return res.status(404).json({ message: "Family member not found" })
    }
    if (familyMember.userId.toString() !== userId) {
      return res.status(403).json({ message: "You don't have permission to delete this family member" })
    }
    await FamilyMember.findByIdAndDelete(req.params.id)
    res.status(200).json({ message: "Family member deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const getHealth = async (req, res) => {
  const userId = req.user._id
  try {
    // get health with insurance details
    const health = await Health.findOne({ userId }).populate("insurance.insuranceProvider")
    if (!health) {
      return res.status(404).json({ message: "Health data not found" })
    }
    res.status(200).json({ message: "Health data fetched successfully", data: health })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}
