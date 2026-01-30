/**
 * Visitor Controller
 * Handles HTTP requests and responses for visitor request operations.
 * Business logic is delegated to visitorService.
 * 
 * @module controllers/visitorController
 */

import { visitorService } from '../services/visitor.service.js';

export const createVisitorRequest = async (req, res) => {
  try {
    const result = await visitorService.createVisitorRequest(req.body, req.user);
    
    res.status(result.statusCode).json({
      message: result.message,
      visitorRequest: result.data,
      success: result.success,
    });
  } catch (error) {
    console.error('Error submitting visitor request:', error);
    res.status(500).json({ message: 'Error submitting visitor request', error: error.message });
  }
};

export const getVisitorRequests = async (req, res) => {
  try {
    const result = await visitorService.getVisitorRequests(req.user);
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Error fetching visitor requests:', error);
    res.status(500).json({
      message: 'Error fetching visitor requests',
      error: error.message,
    });
  }
};

export const getVisitorRequestById = async (req, res) => {
  try {
    const result = await visitorService.getVisitorRequestById(req.params.requestId);
    
    if (!result.success) {
      return res.status(result.statusCode).json({
        message: result.message,
        success: false,
      });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Error fetching visitor request:', error);
    res.status(500).json({
      message: 'Error fetching visitor request',
      error: error.message,
    });
  }
};

export const updateVisitorRequest = async (req, res) => {
  try {
    const result = await visitorService.updateVisitorRequest(req.params.requestId, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({
        message: result.message,
        success: false,
      });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      updatedRequest: result.data,
    });
  } catch (error) {
    console.error('Error updating visitor request status:', error);
    res.status(500).json({
      message: 'Error updating visitor request status',
      error: error.message,
    });
  }
};

export const deleteVisitorRequest = async (req, res) => {
  try {
    const result = await visitorService.deleteVisitorRequest(req.params.requestId);
    
    if (!result.success) {
      return res.status(result.statusCode).json({
        message: result.message,
        success: false,
      });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
    });
  } catch (error) {
    console.error('Error deleting visitor request:', error);
    res.status(500).json({
      message: 'Error deleting visitor request',
      error: error.message,
    });
  }
};

export const updateVisitorRequestStatus = async (req, res) => {
  try {
    const result = await visitorService.updateVisitorRequestStatus(
      req.params.requestId,
      req.params.action,
      req.body
    );
    
    if (!result.success) {
      return res.status(result.statusCode).json({
        message: result.message,
        success: false,
      });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      updatedRequest: result.data,
    });
  } catch (error) {
    console.error('Error updating visitor request status:', error);
    res.status(500).json({
      message: 'Error updating visitor request status',
      error: error.message,
    });
  }
};

export const allocateRoomsToVisitorRequest = async (req, res) => {
  try {
    const result = await visitorService.allocateRoomsToVisitorRequest(
      req.params.requestId,
      req.body.allocationData,
      req.user
    );
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      updatedRequest: result.data,
    });
  } catch (error) {
    console.error('Error allocating rooms to visitor request:', error);
    res.status(500).json({
      message: 'Error allocating rooms to visitor request',
      error: error.message,
    });
  }
};

export const checkInVisitor = async (req, res) => {
  try {
    const result = await visitorService.checkInVisitor(req.params.requestId, req.body);
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      updatedRequest: result.data,
    });
  } catch (error) {
    console.error('Error checking in visitor:', error);
    res.status(500).json({
      message: 'Error checking in visitor',
      error: error.message,
    });
  }
};

export const checkOutVisitor = async (req, res) => {
  try {
    const result = await visitorService.checkOutVisitor(req.params.requestId, req.body);
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      updatedRequest: result.data,
    });
  } catch (error) {
    console.error('Error checking out visitor:', error);
    res.status(500).json({
      message: 'Error checking out visitor',
      error: error.message,
    });
  }
};

export const updateCheckTime = async (req, res) => {
  try {
    const result = await visitorService.updateCheckTime(req.params.requestId, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({
        message: result.message,
        success: false,
      });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      updatedRequest: result.data,
    });
  } catch (error) {
    console.error('Error updating check-in/out time:', error);
    res.status(500).json({
      message: 'Error updating check-in/out time',
      error: error.message,
    });
  }
};

export const getStudentVisitorRequests = async (req, res) => {
  try {
    const result = await visitorService.getStudentVisitorRequests(req.params.userId);
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Error fetching student visitor requests:', error);
    res.status(500).json({
      message: 'Error fetching student visitor requests',
      error: error.message,
    });
  }
};

export const updatePaymentInfo = async (req, res) => {
  try {
    const result = await visitorService.updatePaymentInfo(
      req.params.requestId,
      req.body,
      req.user
    );
    
    if (!result.success) {
      return res.status(result.statusCode).json({
        message: result.message,
        success: false,
      });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: result.success,
      updatedRequest: result.data,
    });
  } catch (error) {
    console.error('Error updating payment information:', error);
    res.status(500).json({
      message: 'Error updating payment information',
      error: error.message,
    });
  }
};
