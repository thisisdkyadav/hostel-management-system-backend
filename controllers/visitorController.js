import VisitorRequest from "../models/VisitorRequest.js";
import User from "../models/User.js"
import StudentProfile from "../models/StudentProfile.js";

export const submitVisitorRequest = async (req, res) => {
  const { numberOfVisitors, visitorNames, visitorContact, visitorEmail, relationWithStudent, visitReason, visitDate } = req.body;
  const user = req.user;

  try {
    const userId = user._id;

    const studentProfile = await StudentProfile.findOne({ userId }).populate("currentRoomAllocation");
   
    if (!studentProfile || !studentProfile.currentRoomAllocation) {
      return res.status(400).json({
        message: "Cannot submit request.",
        success: false,
      });
    }

    const visitorRequest = new VisitorRequest({
      studentId: userId,
      numberOfVisitors,
      visitorNames,
      visitorContact,
      visitorEmail,
      relationWithStudent,
      visitReason,
      visitDate,
      status: "Pending",
    });


    await visitorRequest.save();
    res.status(201).json({ message: "Visitor request submitted successfully", visitorRequest, success: true });
  } catch (error) {
    console.error("Error submitting visitor request:", error);
    res.status(500).json({ message: "Error submitting visitor request", error: error.message });
  }
};


export const getAllVisitorRequests = async (req, res) => {
  try {
  
    const visitorRequests = await VisitorRequest.find().populate("studentId", "name email");

    if (!visitorRequests || visitorRequests.length === 0) {
      return res.status(404).json({
        message: "No visitor requests found",
        success: false,
      });
    }

    res.status(200).json({
      message: "Visitor requests fetched successfully",
      success: true,
      visitorRequests,
    });
  } catch (error) {
    console.error("Error fetching visitor requests:", error);
    res.status(500).json({
      message: "Error fetching visitor requests",
      error: error.message,
    });
  }
};


export const updateVisitorStatus = async (req, res) => {
  const { requestId } = req.params;
  const { status } = req.body; 

  try {
    
    const updatedRequest = await VisitorRequest.findByIdAndUpdate(
      requestId,
      { status },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({
        message: "Visitor request not found",
        success: false,
      });
    }

    res.status(200).json({
      message: `Visitor request updated to '${status}' successfully`,
      success: true,
      updatedRequest,
    });
  } catch (error) {
    console.error("Error updating visitor request status:", error);
    res.status(500).json({
      message: "Error updating visitor request status",
      error: error.message,
    });
  }
};