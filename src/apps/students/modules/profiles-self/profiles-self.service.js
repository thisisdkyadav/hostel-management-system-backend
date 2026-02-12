/**
 * Profiles Self Service
 * Student-facing dashboard/profile and ID card operations.
 */

import BaseService from '../../../../services/base/BaseService.js';
import { success, notFound, forbidden } from '../../../../services/base/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { Complaint } from '../../../../models/index.js';
import { Event as Events } from '../../../../models/index.js';
import { RoomAllocation } from '../../../../models/index.js';
import { LostAndFound } from '../../../../models/index.js';

class ProfilesSelfService extends BaseService {
  constructor() {
    super(StudentProfile);
  }

  /**
   * Get student profile for current user
   */
  async getStudentProfile(userId) {
    const studentProfile = await this.model.getFullStudentData(userId);

    if (!studentProfile) {
      return notFound('Student profile not found');
    }

    return success(studentProfile);
  }

  /**
   * Get student dashboard data
   */
  async getStudentDashboard(userId) {
    const studentProfile = await this.model.getFullStudentData(userId);

    if (!studentProfile) {
      return notFound('Student profile not found');
    }

    const dashboardData = {
      profile: {
        name: studentProfile.name,
        rollNumber: studentProfile.rollNumber,
        degree: studentProfile.degree,
        year: studentProfile.year,
        hostelName: studentProfile.hostel || null,
        profileImage: studentProfile.profileImage || null,
        dateOfBirth: studentProfile.dateOfBirth || null,
      },
      roomInfo: null,
      stats: {
        complaints: { pending: 0, inProgress: 0, resolved: 0, total: 0 },
        lostAndFound: { active: 0, claimed: 0, total: 0 },
        events: { upcoming: 0, past: 0, total: 0 },
      },
      activeComplaints: [],
      upcomingEvents: [],
      resolvedComplaintsWithoutFeedback: [],
    };

    if (studentProfile.allocationId) {
      const roomAllocation = await RoomAllocation.findById(studentProfile.allocationId)
        .populate({ path: 'roomId', populate: { path: 'unitId', select: 'unitNumber' } })
        .populate('hostelId', 'name type');

      if (roomAllocation) {
        const allRoomAllocations = await RoomAllocation.find({
          roomId: roomAllocation.roomId._id,
          _id: { $ne: studentProfile.allocationId },
        }).populate({
          path: 'studentProfileId',
          select: 'rollNumber userId',
          populate: { path: 'userId', select: 'name profileImage' },
        });

        const roomCapacity = roomAllocation.roomId.capacity || 0;

        let displayRoom;
        if (studentProfile.hostelType === 'unit-based' && studentProfile.unit) {
          displayRoom = roomCapacity > 1
            ? `${studentProfile.unit}${studentProfile.room}(${studentProfile.bedNumber})`
            : `${studentProfile.unit}${studentProfile.room}`;
        } else {
          displayRoom = roomCapacity > 1
            ? `${studentProfile.room}(${studentProfile.bedNumber})`
            : `${studentProfile.room}`;
        }

        const beds = [];
        for (let i = 1; i <= roomCapacity; i++) {
          const allocation = [roomAllocation, ...allRoomAllocations].find((a) => a.bedNumber === i);
          beds.push({
            id: i,
            bedNumber: i.toString(),
            isOccupied: !!allocation,
            isCurrentUser: allocation && allocation._id.toString() === studentProfile.allocationId.toString(),
          });
        }

        const roommates = allRoomAllocations
          .filter((allocation) => allocation.studentProfileId)
          .map((allocation) => ({
            rollNumber: allocation.studentProfileId.rollNumber,
            name: allocation.studentProfileId.userId?.name || 'Unknown',
            avatar: allocation.studentProfileId.userId?.profileImage || null,
          }));

        dashboardData.roomInfo = {
          roomNumber: displayRoom,
          bedNumber: studentProfile.bedNumber,
          hostelName: studentProfile.hostel,
          occupiedBeds: allRoomAllocations.length + 1,
          totalBeds: roomCapacity,
          beds,
          roommates,
        };
      }
    }

    const complaints = await Complaint.find({ userId });

    if (complaints.length > 0) {
      dashboardData.stats.complaints = {
        pending: complaints.filter((c) => c.status === 'Pending').length,
        inProgress: complaints.filter((c) => c.status === 'In Progress').length,
        resolved: complaints.filter((c) => c.status === 'Resolved').length,
        total: complaints.length,
      };

      dashboardData.activeComplaints = complaints
        .filter((c) => c.status !== 'Resolved')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map((complaint) => ({
          id: complaint._id,
          title: complaint.title,
          status: complaint.status,
          priority: complaint.priority,
          category: complaint.category,
          description: complaint.description,
          hostel: studentProfile.hostel,
          roomNumber: dashboardData.roomInfo?.roomNumber || '',
          createdDate: complaint.createdAt,
        }));

      dashboardData.resolvedComplaintsWithoutFeedback = complaints
        .filter((c) => c.status === 'Resolved' && !c.feedback && !c.feedbackRating)
        .sort((a, b) => b.resolutionDate - a.resolutionDate)
        .slice(0, 3)
        .map((complaint) => ({
          id: complaint._id,
          title: complaint.title,
          status: complaint.status,
          priority: complaint.priority,
          category: complaint.category,
          description: complaint.description,
          resolutionNotes: complaint.resolutionNotes,
          resolutionDate: complaint.resolutionDate,
          hostel: studentProfile.hostel,
          roomNumber: dashboardData.roomInfo?.roomNumber || '',
          createdDate: complaint.createdAt,
        }));
    }

    const lostAndFoundItems = await LostAndFound.find();

    if (lostAndFoundItems.length > 0) {
      dashboardData.stats.lostAndFound = {
        active: lostAndFoundItems.filter((item) => item.status === 'Active').length,
        claimed: lostAndFoundItems.filter((item) => item.status === 'Claimed').length,
        total: lostAndFoundItems.length,
      };
    }

    const now = new Date();

    const eventsQuery = {
      $or: [
        { hostelId: studentProfile.hostelId.toString() },
        { hostelId: null },
        { gender: studentProfile.gender },
        { gender: null },
      ],
    };
    const events = await Events.find(eventsQuery);

    if (events.length > 0) {
      const upcomingEvents = events.filter((e) => new Date(e.dateAndTime) > now);
      const pastEvents = events.filter((e) => new Date(e.dateAndTime) <= now);

      dashboardData.stats.events = {
        upcoming: upcomingEvents.length,
        past: pastEvents.length,
        total: events.length,
      };
      dashboardData.upcomingEvents = upcomingEvents
        .sort((a, b) => new Date(a.dateAndTime) - new Date(b.dateAndTime))
        .slice(0, 5)
        .map((event) => ({
          _id: event._id,
          eventName: event.eventName,
          description: event.description,
          dateAndTime: event.dateAndTime,
        }));
    }

    return success(dashboardData);
  }

  /**
   * Get student ID card
   */
  async getStudentIdCard(userId, currentUser) {
    if (currentUser.role === 'Student' && currentUser._id.toString() !== userId) {
      return forbidden('Unauthorized');
    }

    const studentProfile = await this.model.findOne({ userId }, 'idCard');

    if (!studentProfile) {
      return notFound('Student profile not found');
    }

    return success(studentProfile.idCard);
  }

  /**
   * Upload student ID card
   */
  async uploadStudentIdCard(currentUser, idCardData) {
    const { front, back } = idCardData;

    if (currentUser.role !== 'Student') {
      return forbidden('Unauthorized');
    }

    const studentProfile = await this.model.findOne({ userId: currentUser._id });
    studentProfile.idCard = { front, back };
    await studentProfile.save();

    return success(null, 200, 'Student ID card uploaded successfully');
  }
}

export const profilesSelfService = new ProfilesSelfService();
