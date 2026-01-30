/**
 * Student Service
 * Business logic for student profile management
 * @module services/student.service
 */

import BaseService from './base/BaseService.js';
import { success, notFound, badRequest, forbidden, withTransaction } from './base/index.js';
import StudentProfile from '../../models/StudentProfile.js';
import Complaint from '../../models/Complaint.js';
import Events from '../../models/Event.js';
import RoomAllocation from '../../models/RoomAllocation.js';
import Room from '../../models/Room.js';
import Unit from '../../models/Unit.js';
import LostAndFound from '../../models/LostAndFound.js';
import mongoose from 'mongoose';
import User from '../../models/User.js';
import bcrypt from 'bcrypt';
import { formatDate } from '../../utils/utils.js';
import Hostel from '../../models/Hostel.js';

class StudentService extends BaseService {
  constructor() {
    super(StudentProfile);
  }

  /**
   * Create student profiles (single or bulk)
   */
  async createStudentsProfiles(studentsData) {
    const session = await mongoose.startSession();
    const studentsArray = Array.isArray(studentsData) ? studentsData : [studentsData];
    let results = [];
    let errors = [];

    try {
      await session.withTransaction(async () => {
        const validStudents = [];
        for (const student of studentsArray) {
          let { email, name, rollNumber, password, phone, profileImage } = student;
          if (email) email = email.trim();

          if (!email || !name || !rollNumber) {
            errors.push({
              student: student.rollNumber || student.email,
              message: 'Missing required fields: email, name, rollNumber'
            });
            continue;
          }

          validStudents.push({ ...student, email });
        }

        if (validStudents.length === 0) return;

        const emails = validStudents.map((student) => student.email);
        const rollNumbers = validStudents.map((student) => student.rollNumber);

        const existingUsers = await User.find({ email: { $in: emails } });
        const existingProfiles = await this.model.find({ rollNumber: { $in: rollNumbers } });

        const existingEmails = new Set(existingUsers.map((user) => user.email));
        const existingRollNumbers = new Set(existingProfiles.map((profile) => profile.rollNumber));

        const uniqueStudents = [];
        for (const student of validStudents) {
          if (existingEmails.has(student.email)) {
            errors.push({ student: student.rollNumber || student.email, message: `Email ${student.email} already exists` });
            continue;
          }
          if (existingRollNumbers.has(student.rollNumber)) {
            errors.push({ student: student.rollNumber || student.email, message: `Roll number ${student.rollNumber} already exists` });
            continue;
          }
          uniqueStudents.push(student);
        }

        const userOps = [];
        const profileOps = [];

        await Promise.all(
          uniqueStudents.map(async (student) => {
            let { email, name, rollNumber, password, phone, profileImage } = student;
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password || rollNumber, salt);

            const userData = {
              email,
              name,
              role: 'Student',
              phone: phone || '',
              profileImage: profileImage || '',
              password: hashedPassword
            };

            userOps.push({ insertOne: { document: userData }, metadata: { student } });
          })
        );

        if (userOps.length > 0) {
          const bulkUserOps = userOps.map((op) => op.insertOne.document);
          const userInsertResult = await User.collection.insertMany(bulkUserOps, { session });
          const insertedUserIds = Object.values(userInsertResult.insertedIds);

          userOps.forEach((op, index) => {
            const student = op.metadata.student;
            const { email, rollNumber, department, degree, gender, dateOfBirth, address, admissionDate, guardian, guardianPhone, guardianEmail } = student;
            const userId = insertedUserIds[index];
            const profileData = {
              userId,
              rollNumber,
              department: department || '',
              degree: degree || '',
              gender: gender || '',
              dateOfBirth: formatDate(dateOfBirth) || null,
              address: address || '',
              admissionDate: formatDate(admissionDate) || null,
              guardian: guardian || '',
              guardianPhone: guardianPhone || '',
              guardianEmail: guardianEmail || '',
              status: 'Active'
            };
            profileOps.push({ insertOne: { document: profileData } });
          });

          if (profileOps.length > 0) {
            const profileInsertResult = await this.model.collection.insertMany(
              profileOps.map((op) => op.insertOne.document),
              { session }
            );
            Object.values(userInsertResult.insertedIds).forEach((id, idx) => {
              results.push({
                user: { _id: id },
                profile: { _id: profileInsertResult.insertedIds[idx], rollNumber: uniqueStudents[idx].rollNumber }
              });
            });
          }
        }
      });

      const isMultipleStudents = Array.isArray(studentsData);
      const responseStatus = errors.length > 0 ? 207 : 201;
      
      return {
        success: true,
        statusCode: responseStatus,
        data: isMultipleStudents ? results : results[0],
        errors: errors.length > 0 ? errors : undefined,
        message: isMultipleStudents 
          ? `Created ${results.length} out of ${studentsArray.length} student profiles` 
          : 'Student profile created successfully'
      };
    } catch (error) {
      if (session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (abortErr) {
          console.error('Abort transaction error:', abortErr);
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Update student profiles (single or bulk)
   */
  async updateStudentsProfiles(studentsData, currentUser) {
    const session = await mongoose.startSession();
    await session.startTransaction();
    try {
      const studentsArray = Array.isArray(studentsData) ? studentsData : [studentsData];
      const errors = [];
      const results = [];

      const rollNumbers = [];
      for (const student of studentsArray) {
        if (!student.rollNumber) {
          errors.push({ student: student.email || student.rollNumber || 'Unknown', message: 'Missing required field: rollNumber' });
        } else {
          rollNumbers.push(student.rollNumber.toUpperCase());
        }
      }
      
      if (rollNumbers.length === 0) {
        await session.abortTransaction();
        return badRequest('No valid rollNumber provided');
      }

      const existingProfiles = await this.model.find({ rollNumber: { $in: rollNumbers } })
        .populate('userId')
        .session(session);

      const profileMap = {};
      existingProfiles.forEach((profile) => {
        profileMap[profile.rollNumber] = profile;
      });

      const userBulkOps = [];
      const profileBulkOps = [];

      for (const student of studentsArray) {
        const roll = student.rollNumber;
        if (!roll) continue;
        const existingProfile = profileMap[roll.toUpperCase()];
        if (!existingProfile) {
          errors.push({ student: roll, message: `Student with roll number ${roll} not found` });
          continue;
        }

        const userUpdate = {};
        if (student.name) userUpdate.name = student.name;
        if (student.email) userUpdate.email = student.email ? student.email.trim() : student.email;
        if (student.password) userUpdate.password = await bcrypt.hash(student.password, 10);
        if (student.phone !== undefined) userUpdate.phone = student.phone || '';
        if (student.profileImage !== undefined) userUpdate.profileImage = student.profileImage || '';

        if (Object.keys(userUpdate).length > 0) {
          userBulkOps.push({ updateOne: { filter: { _id: existingProfile.userId._id }, update: { $set: userUpdate } } });
        }

        const profileUpdate = {};
        if (student.gender !== undefined) profileUpdate.gender = student.gender;
        if (student.dateOfBirth !== undefined) profileUpdate.dateOfBirth = formatDate(student.dateOfBirth);
        if (student.department !== undefined) profileUpdate.department = student.department;
        if (student.degree !== undefined) profileUpdate.degree = student.degree;
        if (student.address !== undefined) profileUpdate.address = student.address;
        if (student.admissionDate !== undefined) profileUpdate.admissionDate = formatDate(student.admissionDate);
        if (student.guardian !== undefined) profileUpdate.guardian = student.guardian;
        if (student.guardianPhone !== undefined) profileUpdate.guardianPhone = student.guardianPhone;
        if (student.guardianEmail !== undefined) profileUpdate.guardianEmail = student.guardianEmail;

        if (Object.keys(profileUpdate).length > 0 && currentUser?._id) {
          profileUpdate.lastUpdatedBy = currentUser._id;
          profileBulkOps.push({ updateOne: { filter: { _id: existingProfile._id }, update: { $set: profileUpdate } } });
        }

        results.push({
          rollNumber: roll,
          userId: existingProfile.userId._id,
          updated: { user: Object.keys(userUpdate).length > 0, profile: Object.keys(profileUpdate).length > 0 }
        });
      }

      if (userBulkOps.length > 0) {
        await User.bulkWrite(userBulkOps, { session });
      }

      if (profileBulkOps.length > 0) {
        await this.model.bulkWrite(profileBulkOps, { session });
      }

      if (userBulkOps.length === 0 && profileBulkOps.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return success(results, 200, 'No updates were needed for the provided data');
      }

      await session.commitTransaction();
      session.endSession();
      
      const isMultipleStudents = Array.isArray(studentsData);
      const responseStatus = errors.length > 0 ? 207 : 200;
      
      return {
        success: true,
        statusCode: responseStatus,
        data: isMultipleStudents ? results : results[0],
        errors: errors.length > 0 ? errors : undefined,
        message: isMultipleStudents 
          ? `Updated ${results.length} out of ${studentsArray.length} student profiles` 
          : 'Student profile updated successfully'
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Update room allocations for students
   */
  async updateRoomAllocations(hostelId, allocationsData) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const allocations = Array.isArray(allocationsData) ? allocationsData : [allocationsData];
      const results = [];
      const errors = [];

      const hostelData = await Hostel.findById(hostelId);
      if (!hostelData) {
        await session.abortTransaction();
        session.endSession();
        return notFound('Hostel not found');
      }

      const selectedHostelType = hostelData.type;
      const requiredFields = selectedHostelType === 'unit-based' 
        ? ['unit', 'room', 'bedNumber', 'rollNumber'] 
        : ['room', 'bedNumber', 'rollNumber'];

      const validAllocations = [];
      for (const alloc of allocations) {
        const { unit, room, bedNumber, rollNumber } = alloc;

        let missingFields = false;
        if (selectedHostelType === 'unit-based') {
          if (!unit || !room || bedNumber === undefined || !rollNumber) missingFields = true;
        } else {
          if (!room || bedNumber === undefined || !rollNumber) missingFields = true;
        }

        if (missingFields) {
          errors.push({ rollNumber: rollNumber || 'Unknown', message: `Missing required fields: ${requiredFields.join(', ')}` });
        } else {
          validAllocations.push({ ...alloc, rollNumber: rollNumber.toUpperCase() });
        }
      }

      if (validAllocations.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return badRequest('No valid allocation data provided');
      }

      const rollNumbers = validAllocations.map((a) => a.rollNumber);
      const studentProfiles = await this.model.find({ rollNumber: { $in: rollNumbers } }).session(session);

      const profileMap = {};
      studentProfiles.forEach((profile) => {
        profileMap[profile.rollNumber] = profile;
      });

      let unitMap = {};
      let roomMap = {};
      let rooms = [];

      if (selectedHostelType === 'unit-based') {
        const unitNumbers = [...new Set(validAllocations.map((a) => a.unit))];
        const units = await Unit.find({ unitNumber: { $in: unitNumbers }, hostelId }).session(session);

        units.forEach((unit) => {
          unitMap[unit.unitNumber] = unit;
        });

        const unitIds = units.map((unit) => unit._id);
        const roomNumbers = [...new Set(validAllocations.map((a) => a.room))];
        rooms = await Room.find({ unitId: { $in: unitIds }, roomNumber: { $in: roomNumbers } }).session(session);

        rooms.forEach((room) => {
          const unitNumber = units.find((u) => u._id.equals(room.unitId))?.unitNumber;
          if (unitNumber) roomMap[`${unitNumber}:${room.roomNumber}`] = room;
        });
      } else {
        const roomNumbers = [...new Set(validAllocations.map((a) => a.room))];
        rooms = await Room.find({ hostelId, roomNumber: { $in: roomNumbers }, unitId: { $exists: false } }).session(session);

        rooms.forEach((room) => {
          roomMap[room.roomNumber] = room;
        });
      }

      const roomIds = rooms.map((room) => room._id);
      const bedNumbers = validAllocations.map((a) => a.bedNumber);
      const existingAllocations = await RoomAllocation.find({ roomId: { $in: roomIds }, bedNumber: { $in: bedNumbers } }).session(session);

      const existingAllocMap = {};
      existingAllocations.forEach((alloc) => {
        existingAllocMap[`${alloc.roomId}:${alloc.bedNumber}`] = alloc;
      });

      const studentIds = studentProfiles.map((profile) => profile._id);
      const currentAllocations = await RoomAllocation.find({ studentProfileId: { $in: studentIds } }).session(session);

      const currentAllocMap = {};
      currentAllocations.forEach((alloc) => {
        currentAllocMap[alloc.studentProfileId.toString()] = alloc;
      });

      const allocationsToDelete = [];
      const allocationsToCreate = [];

      for (const alloc of validAllocations) {
        const { unit, room, bedNumber, rollNumber } = alloc;

        const studentProfile = profileMap[rollNumber];
        if (!studentProfile) {
          errors.push({ rollNumber, message: 'Student profile not found' });
          continue;
        }

        let roomDoc = null;

        if (selectedHostelType === 'unit-based') {
          const unitDoc = unitMap[unit];
          if (!unitDoc) {
            errors.push({ rollNumber, message: 'Unit not found' });
            continue;
          }
          roomDoc = roomMap[`${unit}:${room}`];
          if (!roomDoc) {
            errors.push({ rollNumber, message: 'Room not found in specified unit' });
            continue;
          }
        } else {
          roomDoc = roomMap[room];
          if (!roomDoc) {
            errors.push({ rollNumber, message: 'Room not found' });
            continue;
          }
        }

        if (roomDoc.status !== 'Active') {
          errors.push({ rollNumber, message: 'Room is not active' });
          continue;
        }

        const existingAlloc = existingAllocMap[`${roomDoc._id}:${bedNumber}`];
        if (existingAlloc) allocationsToDelete.push(existingAlloc._id);

        const currentAlloc = currentAllocMap[studentProfile._id.toString()];
        if (currentAlloc) {
          if (!currentAlloc.roomId.equals(roomDoc._id) || currentAlloc.bedNumber !== bedNumber) {
            allocationsToDelete.push(currentAlloc._id);
          }
        }

        const newAllocation = new RoomAllocation({
          userId: studentProfile.userId,
          studentProfileId: studentProfile._id,
          hostelId: roomDoc.hostelId,
          roomId: roomDoc._id,
          unitId: roomDoc.unitId,
          bedNumber
        });

        allocationsToCreate.push(newAllocation);
        results.push({ rollNumber, allocation: newAllocation });
      }

      if (allocationsToDelete.length > 0) {
        await RoomAllocation.deleteMany({ _id: { $in: allocationsToDelete } }).session(session);
      }

      if (allocationsToCreate.length > 0) {
        await RoomAllocation.insertMany(allocationsToCreate, { session });
      }

      await session.commitTransaction();
      session.endSession();

      const responseStatus = errors.length > 0 ? 207 : 200;
      return {
        success: true,
        statusCode: responseStatus,
        data: results,
        errors: errors.length > 0 ? errors : undefined,
        message: errors.length > 0 
          ? 'Room allocations updated with some errors. Please review the errors for details.'
          : 'Room allocations updated successfully'
      };
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  }

  /**
   * Get students with search/filter
   */
  async getStudents(query, user) {
    let searchQuery = { ...query };

    if (user.hostel) {
      searchQuery.hostelId = user.hostel._id.toString();
    }

    const studentProfilesResult = await this.model.searchStudents(searchQuery);
    const studentProfiles = studentProfilesResult[0].data;
    const totalCount = studentProfilesResult[0].totalCount[0]?.count || 0;
    const missingOptions = this.model.getMissingFieldOptions();

    return {
      success: true,
      statusCode: 200,
      data: studentProfiles,
      pagination: {
        total: totalCount,
        page: parseInt(searchQuery.page),
        limit: parseInt(searchQuery.limit),
        pages: Math.ceil(totalCount / parseInt(searchQuery.limit))
      },
      meta: { missingOptions }
    };
  }

  /**
   * Get student details by user ID
   */
  async getStudentDetails(userId) {
    const studentProfile = await this.model.getFullStudentData(userId);

    if (!studentProfile) {
      return notFound('Student profile not found');
    }

    return success(studentProfile);
  }

  /**
   * Get multiple student details by user IDs
   */
  async getMultipleStudentDetails(userIds) {
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return badRequest('Please provide an array of user IDs');
    }

    if (userIds.length > 5000) {
      return badRequest('Maximum of 50 student profiles can be fetched at once');
    }

    const studentsData = await this.model.getFullStudentData(userIds);

    if (studentsData.length === 0) {
      return notFound('No student profiles found');
    }

    const foundUserIds = studentsData.map((student) => student.userId.toString());
    const missingUserIds = userIds.filter((id) => !foundUserIds.includes(id));

    const errors = missingUserIds.map((userId) => ({ userId, message: 'Student profile not found' }));
    const responseStatus = errors.length > 0 ? 207 : 200;

    return {
      success: true,
      statusCode: responseStatus,
      data: studentsData,
      errors: errors.length > 0 ? errors : undefined,
      message: `Retrieved ${studentsData.length} out of ${userIds.length} student profiles`
    };
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
   * Get student ID by user ID
   */
  async getStudentId(userId) {
    const student = await this.model.findOne({ userId });
    return success({ studentId: student?._id?.toString() });
  }

  /**
   * Update student profile
   */
  async updateStudentProfile(userId, updateData) {
    const { 
      name, email, rollNumber, phone, gender, dateOfBirth, address, 
      department, degree, admissionDate, guardian, guardianPhone, 
      guardianEmail, profileImage 
    } = updateData;

    const trimmedEmail = email ? email.trim() : email;

    const updatedUser = await User.findByIdAndUpdate(
      userId, 
      { name, email: trimmedEmail, phone, profileImage }, 
      { new: true }
    );

    if (!updatedUser) {
      return notFound('User not found or update failed');
    }

    const profileUpdateData = {
      rollNumber, gender, dateOfBirth, address, department, degree,
      admissionDate, guardian, guardianPhone, guardianEmail
    };

    const updatedProfile = await this.model.findOneAndUpdate(
      { userId },
      { $set: profileUpdateData },
      { new: true }
    );

    if (!updatedProfile) {
      return notFound('Student profile not found or update failed');
    }

    return success(null, 200, 'Student profile updated successfully');
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
        dateOfBirth: studentProfile.dateOfBirth || null
      },
      roomInfo: null,
      stats: {
        complaints: { pending: 0, inProgress: 0, resolved: 0, total: 0 },
        lostAndFound: { active: 0, claimed: 0, total: 0 },
        events: { upcoming: 0, past: 0, total: 0 }
      },
      activeComplaints: [],
      upcomingEvents: [],
      resolvedComplaintsWithoutFeedback: []
    };

    if (studentProfile.allocationId) {
      const roomAllocation = await RoomAllocation.findById(studentProfile.allocationId)
        .populate({ path: 'roomId', populate: { path: 'unitId', select: 'unitNumber' } })
        .populate('hostelId', 'name type');

      if (roomAllocation) {
        const allRoomAllocations = await RoomAllocation.find({
          roomId: roomAllocation.roomId._id,
          _id: { $ne: studentProfile.allocationId }
        }).populate({
          path: 'studentProfileId',
          select: 'rollNumber userId',
          populate: { path: 'userId', select: 'name profileImage' }
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
            isCurrentUser: allocation && allocation._id.toString() === studentProfile.allocationId.toString()
          });
        }

        const roommates = allRoomAllocations
          .filter((allocation) => allocation.studentProfileId)
          .map((allocation) => ({
            rollNumber: allocation.studentProfileId.rollNumber,
            name: allocation.studentProfileId.userId?.name || 'Unknown',
            avatar: allocation.studentProfileId.userId?.profileImage || null
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
          createdDate: complaint.createdAt
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
          createdDate: complaint.createdAt
        }));
    }

    const lostAndFoundItems = await LostAndFound.find();

    if (lostAndFoundItems.length > 0) {
      dashboardData.stats.lostAndFound = {
        active: lostAndFoundItems.filter((item) => item.status === 'Active').length,
        claimed: lostAndFoundItems.filter((item) => item.status === 'Claimed').length,
        total: lostAndFoundItems.length
      };
    }

    const now = new Date();

    const eventsQuery = {
      $or: [
        { hostelId: studentProfile.hostelId.toString() }, 
        { hostelId: null }, 
        { gender: studentProfile.gender }, 
        { gender: null }
      ]
    };
    const events = await Events.find(eventsQuery);

    if (events.length > 0) {
      const upcomingEvents = events.filter((e) => new Date(e.dateAndTime) > now);
      const pastEvents = events.filter((e) => new Date(e.dateAndTime) <= now);

      dashboardData.stats.events = {
        upcoming: upcomingEvents.length,
        past: pastEvents.length,
        total: events.length
      };
      dashboardData.upcomingEvents = upcomingEvents
        .sort((a, b) => new Date(a.dateAndTime) - new Date(b.dateAndTime))
        .slice(0, 5)
        .map((event) => ({
          _id: event._id,
          eventName: event.eventName,
          description: event.description,
          dateAndTime: event.dateAndTime
        }));
    }

    return success(dashboardData);
  }

  /**
   * File a complaint
   */
  async fileComplaint(userId, complaintData) {
    const { title, description, complaintType, priority, attachments, location, hostel, roomNumber } = complaintData;

    const newComplaint = new Complaint({
      userId, title, description, complaintType, priority, attachments, location, hostel, roomNumber
    });
    await newComplaint.save();

    return success(newComplaint, 201);
  }

  /**
   * Get all complaints for a user
   */
  async getAllComplaints(userId) {
    const complaints = await Complaint.find({ userId })
      .populate('userId', 'name email role')
      .exec();
    
    return success(complaints);
  }

  /**
   * Update a complaint
   */
  async updateComplaint(complaintId, updateData) {
    const updatedComplaint = await Complaint.findOneAndUpdate(
      { _id: complaintId },
      { $set: { ...updateData } },
      { new: true }
    );
    
    if (!updatedComplaint) {
      return notFound('Complaint not found');
    }
    
    // Note: Message kept same as original for backward compatibility
    return success(null, 200, 'Complaint deleted successfully');
  }

  /**
   * Delete a complaint
   */
  async deleteComplaint(complaintId) {
    const deletedComplaint = await Complaint.findOneAndDelete({ _id: complaintId });
    
    if (!deletedComplaint) {
      return notFound('Complaint not found');
    }
    
    return success(null, 200, 'Complaint deleted successfully');
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

  /**
   * Bulk update students status
   */
  async bulkUpdateStudentsStatus(status, rollNumbers) {
    const existingStudents = await this.model.find({ rollNumber: { $in: rollNumbers } });
    const existingRollNumbers = existingStudents.map((student) => student.rollNumber);
    const unsuccessfulRollNumbers = rollNumbers.filter((rollNumber) => !existingRollNumbers.includes(rollNumber));

    const students = await this.model.updateMany({ rollNumber: { $in: existingRollNumbers } }, { status });

    if (students.modifiedCount === 0) {
      return {
        success: false,
        statusCode: 404,
        message: 'No students found to update',
        unsuccessfulRollNumbers: rollNumbers
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Students status updated successfully',
      updatedCount: students.modifiedCount,
      unsuccessfulRollNumbers
    };
  }

  /**
   * Bulk update day scholar details
   */
  async bulkUpdateDayScholarDetails(data) {
    const results = [];
    const errors = [];
    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();

      const rollNumbers = Object.keys(data);
      const students = await this.model.find({ rollNumber: { $in: rollNumbers } }).session(session);

      const studentMap = new Map();
      students.forEach((student) => {
        studentMap.set(student.rollNumber, student);
      });

      const bulkOperations = [];

      for (const [rollNumber, studentData] of Object.entries(data)) {
        const student = studentMap.get(rollNumber);

        if (!student) {
          errors.push({ rollNumber, error: 'Student not found' });
          continue;
        }

        const { isDayScholar, dayScholarDetails } = studentData;

        if (isDayScholar) {
          if (!dayScholarDetails || !dayScholarDetails.address || !dayScholarDetails.ownerName || !dayScholarDetails.ownerPhone || !dayScholarDetails.ownerEmail) {
            errors.push({ rollNumber, error: 'Incomplete day scholar details' });
            continue;
          }

          student.isDayScholar = true;
          student.dayScholarDetails = dayScholarDetails;
        } else {
          student.isDayScholar = false;
          student.dayScholarDetails = null;
        }

        bulkOperations.push(student);
        results.push({ rollNumber, success: true, isDayScholar: student.isDayScholar });
      }

      if (bulkOperations.length > 0) {
        await Promise.all(bulkOperations.map((student) => student.save({ session })));
      }

      await session.commitTransaction();
      session.endSession();

      const responseStatus = errors.length > 0 ? 207 : 200;
      return {
        success: true,
        statusCode: responseStatus,
        data: results,
        errors: errors.length > 0 ? errors : undefined,
        message: errors.length > 0 
          ? 'Day scholar details updated with some errors. Please review the errors for details.'
          : 'Day scholar details updated successfully'
      };
    } catch (error) {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
      throw error;
    }
  }
}

export const studentService = new StudentService();
