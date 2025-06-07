import InsuranceProvider from "../models/InsuranceProvider.js"

export const createInsuranceProvider = async (req, res) => {
  const { name, address, phone, email, startDate, endDate } = req.body
  try {
    const insuranceProvider = await InsuranceProvider.create({ name, address, phone, email, startDate, endDate })
    res.status(201).json({ message: "Insurance provider created", insuranceProvider })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getInsuranceProviders = async (req, res) => {
  try {
    const insuranceProviders = await InsuranceProvider.find()
    res.status(200).json({ message: "Insurance providers fetched", insuranceProviders })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateInsuranceProvider = async (req, res) => {
  const { id } = req.params
  const { name, address, phone, email, startDate, endDate } = req.body
  try {
    const insuranceProvider = await InsuranceProvider.findByIdAndUpdate(id, { name, address, phone, email, startDate, endDate }, { new: true })
    res.status(200).json({ message: "Insurance provider updated", insuranceProvider })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteInsuranceProvider = async (req, res) => {
  const { id } = req.params
  try {
    await InsuranceProvider.findByIdAndDelete(id)
    res.status(200).json({ message: "Insurance provider deleted" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
