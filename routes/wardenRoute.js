import express from 'express';
import { 
  getResolvedAndPendingComplaints, 
  getAllComplaints, 
  assignComplaint, 
  getComplaintStatus,
  createPoll,
  getPollResults,
  getRecentPolls,
  createStudent
} from '../controllers/wardenController.js';

const router = express.Router();

// Complaint-related routes
router.get('/complaints/status/:wardenId', getResolvedAndPendingComplaints);
router.get('/complaints/:wardenId', getAllComplaints);
router.post('/complaints/assign', assignComplaint);
router.get('/complaints/details/:wardenId', getComplaintStatus);

// Poll-related routes
router.post('/polls/create/:wardenId', createPoll);
router.get('/polls/results/:pollId', getPollResults);
router.get('/polls/recent', getRecentPolls);

// Student-related routes
router.post('/students/create', createStudent); // Store student details

export default router;
