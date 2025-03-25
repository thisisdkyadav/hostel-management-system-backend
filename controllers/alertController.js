import Alert from "../models/Alert.js";
import User from "../models/User.js"; 

// Trigger an alert
export const triggerAlert = async (req, res) => {
  const { userId } = req.params; 
  const { type } = req.body; 
  if (!["fire", "medical", "security-issue"].includes(type)) {
    return res.status(400).json({ message: "Invalid alert type" });
  }

  try {
    const recipients = await User.find({ role: { $in: ["Warden", "Admin"] } }).select("_id");

    const newAlert = new Alert({
      type,
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

// Get all alerts for Warden/Admin
export const getAlerts = async (req, res) => {
  const { userId } = req.params; 

  try {
    const alerts = await Alert.find({ recipients: userId })
      .populate("triggeredBy", "name role")
      .sort({ createdAt: -1 });

    res.status(200).json(alerts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Resolve an alert
export const resolveAlert = async (req, res) => {
  const { alertId } = req.params;

  try {
    const alert = await Alert.findByIdAndUpdate(alertId, { status: "resolved" }, { new: true });

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.status(200).json({ message: "Alert resolved", alert });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
