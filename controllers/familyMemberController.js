import FamilyMember from "../models/FamilyMember.js"
import User from "../models/User.js"
export const createFamilyMember = async (req, res) => {
  const { name, relationship, phone, email, address } = req.body
  const userId = req.params.userId
  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    const familyMember = await FamilyMember.create({ userId, name, relationship, phone, email, address })
    res.status(201).json({ message: "Family member created successfully", familyMember })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const getFamilyMembers = async (req, res) => {
  const userId = req.params.userId
  try {
    const familyMembers = await FamilyMember.find({ userId })
    res.status(200).json({ message: "Family members fetched successfully", data: familyMembers })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const updateFamilyMember = async (req, res) => {
  const { id } = req.params
  const { name, relationship, phone, email, address } = req.body
  try {
    const familyMember = await FamilyMember.findByIdAndUpdate(id, { name, relationship, phone, email, address }, { new: true })
    res.status(200).json({ message: "Family member updated successfully", familyMember })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const deleteFamilyMember = async (req, res) => {
  const { id } = req.params
  try {
    await FamilyMember.findByIdAndDelete(id)
    res.status(200).json({ message: "Family member deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}
