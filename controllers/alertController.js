import Alert from "../models/Alert.js";
import User from "../models/User.js"; 

// Trigger an alert
export const triggerAlert = async (req, res) => {
  const { userId } = req.params; 
  const { type, description } = req.body; 

  if (!["fire", "medical", "security-issue", "other"].includes(type)) {
    return res.status(400).json({ message: "Invalid alert type" });
  }
  if (type === "other" && !description) {
    return res.status(400).json({ message: "Description is required for 'other' type alerts" });
  }

  try {
    
    const recipients = await User.find({ role: { $in: ["warden", "admin", "security"] } }).select("_id");

   
    const newAlert = new Alert({
      type,
      description, 
      triggeredBy: userId,
      recipients: recipients.map((user) => user._id),
    });

    await newAlert.save();
    res.status(201).json({ message: "Alert triggered successfully", alert: newAlert });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};


export const getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find().populate("triggeredBy", "name role"); 
    res.status(200).json(alerts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};


export const resolveAlert = async (req, res) => {
  const { alertId } = req.params;
  const { userId } = req.body; 

  try {
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    if (!alert.resolvedBy.includes(userId)) {
      alert.resolvedBy.push(userId);
      await alert.save();
    }

    res.status(200).json({ message: "Alert resolved", alert });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteAlert = async (req, res) => {
  const { alertId } = req.params;

  try {
    const alert = await Alert.findById(alertId);
    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

   
    if (alert.resolvedBy.length >= 2) {
      await Alert.findByIdAndDelete(alertId);
      return res.status(200).json({ message: "Alert deleted successfully" });
    }

    res.status(400).json({ message: "Alert cannot be deleted until all concerned roles resolve it." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
