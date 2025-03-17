import Complaint from '../models/Complaint.js';

// Get dashboard stats
export const getDashboardStats = async (req, res) => {
  try {
    const totalComplaints = await Complaint.countDocuments();
    const resolvedComplaints = await Complaint.countDocuments({ status: 'Resolved' });
    const inProgressComplaints = await Complaint.countDocuments({ status: 'In Progress' });
    const pendingComplaints = await Complaint.countDocuments({ status: 'Pending' });

    res.status(200).json({
      totalComplaints,
      resolvedComplaints,
      inProgressComplaints,
      pendingComplaints
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get recent complaints
export const getRecentComplaints = async (req, res) => {
  try {
    const recentComplaints = await Complaint.find()
      .sort({ createdAt: -1 })
      .limit(5);

    res.status(200).json(recentComplaints);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
