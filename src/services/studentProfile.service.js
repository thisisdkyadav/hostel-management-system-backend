/**
 * Student Profile Service
 * Contains all business logic for student profile operations.
 * 
 * @module services/studentProfile
 */

import StudentProfile from '../../models/StudentProfile.js';
import User from '../../models/User.js';
import FamilyMember from '../../models/FamilyMember.js';
import { getConfigWithDefault } from '../../utils/configDefaults.js';
import Health from '../../models/Health.js';

class StudentProfileService {
  /**
   * Get editable profile fields for a student
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getEditableProfile(userId) {
    // Get student editable fields from configuration
    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = config?.value || ['profileImage', 'dateOfBirth'];

    // Find the student profile
    const studentProfile = await StudentProfile.findOne({ userId }).populate(
      'userId',
      'name email profileImage phone'
    );

    if (!studentProfile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student profile not found',
      };
    }

    // Create a response with only the editable fields
    const editableProfile = {};
    const health = await Health.findOne({ userId });

    // Extract fields based on configuration
    editableFields.forEach((field) => {
      switch (field) {
        case 'name':
          editableProfile.name = studentProfile.userId?.name || '';
          break;
        case 'profileImage':
          editableProfile.profileImage = studentProfile.userId?.profileImage || '';
          break;
        case 'gender':
          editableProfile.gender = studentProfile.gender || '';
          break;
        case 'dateOfBirth':
          editableProfile.dateOfBirth = studentProfile.dateOfBirth
            ? studentProfile.dateOfBirth.toISOString().split('T')[0]
            : '';
          break;
        case 'address':
          editableProfile.address = studentProfile.address || '';
          break;
        case 'familyMembers':
          editableProfile.familyMembers = true;
          break;
        case 'phone':
          editableProfile.phone = studentProfile.userId.phone || '';
          break;
        case 'emergencyContact':
          editableProfile.guardian = studentProfile.guardian || '';
          editableProfile.guardianPhone = studentProfile.guardianPhone || '';
          editableProfile.guardianEmail = studentProfile.guardianEmail || '';
          break;
        case 'bloodGroup':
          editableProfile.bloodGroup = health?.bloodGroup || '';
          break;
        case 'admissionDate':
          editableProfile.admissionDate = studentProfile.admissionDate
            ? studentProfile.admissionDate.toISOString().split('T')[0]
            : '';
          break;
      }
    });

    console.log('editableProfile', editableProfile);

    return {
      success: true,
      statusCode: 200,
      data: { editableProfile, editableFields },
    };
  }

  /**
   * Update student profile
   * @param {string} userId - User ID
   * @param {Object} body - Update data
   * @returns {Object} Result object
   */
  async updateStudentProfile(userId, body) {
    // Get student editable fields from configuration
    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = config?.value || ['profileImage', 'dateOfBirth'];

    // Find the student profile
    const studentProfile = await StudentProfile.findOne({ userId });
    if (!studentProfile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student profile not found',
      };
    }

    // Get user for profile update
    const user = await User.findById(userId);
    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'User not found',
      };
    }

    // Filter request body to only include editable fields
    const updates = {};
    const userUpdates = {};

    // Process each field in the request
    Object.keys(body).forEach((field) => {
      console.log('field', field);

      // Skip null or undefined values
      if (body[field] === null || body[field] === undefined) return;
      console.log('body[field]', body[field]);

      switch (field) {
        case 'name':
          if (editableFields.includes('name')) {
            userUpdates.name = body.name;
          }
          break;
        case 'profileImage':
          if (editableFields.includes('profileImage')) {
            userUpdates.profileImage = body.profileImage;
          }
          break;
        case 'phone':
          if (editableFields.includes('phone')) {
            userUpdates.phone = body.phone;
          }
          break;
        case 'gender':
          if (editableFields.includes('gender') && ['Male', 'Female', 'Other'].includes(body.gender)) {
            updates.gender = body.gender;
          }
          break;
        case 'dateOfBirth':
          if (editableFields.includes('dateOfBirth')) {
            try {
              const date = new Date(body.dateOfBirth);
              if (!isNaN(date.getTime())) {
                updates.dateOfBirth = date;
              }
            } catch (err) {
              // Invalid date, ignore
            }
          }
          break;
        case 'address':
          if (editableFields.includes('address')) {
            updates.address = body.address;
          }
          break;
        case 'emergencyContact':
          if (editableFields.includes('emergencyContact')) {
            console.log('body.emergencyContact', body.emergencyContact);
            updates.guardian = body.emergencyContact.guardian;
            updates.guardianPhone = body.emergencyContact.guardianPhone;
            updates.guardianEmail = body.emergencyContact.guardianEmail;
          }
          break;
        case 'bloodGroup':
          if (editableFields.includes('bloodGroup')) {
            updates.bloodGroup = body.bloodGroup;
          }
          break;
        case 'admissionDate':
          if (editableFields.includes('admissionDate')) {
            updates.admissionDate = body.admissionDate;
          }
          break;
      }
    });

    // Update health if bloodGroup is provided
    if (updates.bloodGroup) {
      await Health.updateOne({ userId }, { $set: { bloodGroup: updates.bloodGroup } });
    }

    // Update student profile if there are changes
    if (Object.keys(updates).length > 0) {
      await StudentProfile.updateOne({ _id: studentProfile._id }, { $set: updates });
    }

    // Update user if there are changes
    if (Object.keys(userUpdates).length > 0) {
      await User.updateOne({ _id: userId }, { $set: userUpdates });
    }

    // If no updates were made
    if (Object.keys(updates).length === 0 && Object.keys(userUpdates).length === 0) {
      return {
        success: false,
        statusCode: 400,
        message: "No valid updates provided or you don't have permission to update these fields",
        data: { editableFields },
      };
    }

    // Fetch updated student profile with user details
    const updatedProfile = await StudentProfile.getFullStudentData(userId);

    return {
      success: true,
      statusCode: 200,
      message: 'Profile updated successfully',
      data: { profile: updatedProfile, editableFields },
    };
  }

  /**
   * Get student profile
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getStudentProfile(userId) {
    // Get student profile with all details
    const profile = await StudentProfile.getFullStudentData(userId);

    if (!profile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student profile not found',
      };
    }

    // Get editable fields from configuration
    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = config?.value || ['profileImage', 'dateOfBirth'];

    return {
      success: true,
      statusCode: 200,
      data: { profile, editableFields },
    };
  }

  /**
   * Get family members
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getFamilyMembers(userId) {
    const familyMembers = await FamilyMember.find({ userId });
    return {
      success: true,
      statusCode: 200,
      message: 'Family members fetched successfully',
      data: familyMembers,
    };
  }

  /**
   * Add family member
   * @param {string} userId - User ID
   * @param {Object} memberData - Family member data
   * @returns {Object} Result object
   */
  async addFamilyMember(userId, { name, relationship, phone, email, address }) {
    const familyMember = await FamilyMember.create({
      userId,
      name,
      relationship,
      phone,
      email,
      address,
    });

    return {
      success: true,
      statusCode: 201,
      message: 'Family member added successfully',
      data: familyMember,
    };
  }

  /**
   * Update family member
   * @param {string} userId - User ID
   * @param {string} memberId - Family member ID
   * @param {Object} memberData - Update data
   * @returns {Object} Result object
   */
  async updateFamilyMember(userId, memberId, { name, relationship, phone, email, address }) {
    const familyMember = await FamilyMember.findById(memberId);
    if (!familyMember) {
      return {
        success: false,
        statusCode: 404,
        message: 'Family member not found',
      };
    }

    if (familyMember.userId.toString() !== userId) {
      return {
        success: false,
        statusCode: 403,
        message: "You don't have permission to update this family member",
      };
    }

    const updatedFamilyMember = await FamilyMember.findByIdAndUpdate(
      memberId,
      { name, relationship, phone, email, address },
      { new: true }
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Family member updated successfully',
      data: updatedFamilyMember,
    };
  }

  /**
   * Delete family member
   * @param {string} userId - User ID
   * @param {string} memberId - Family member ID
   * @returns {Object} Result object
   */
  async deleteFamilyMember(userId, memberId) {
    const familyMember = await FamilyMember.findById(memberId);
    if (!familyMember) {
      return {
        success: false,
        statusCode: 404,
        message: 'Family member not found',
      };
    }

    if (familyMember.userId.toString() !== userId) {
      return {
        success: false,
        statusCode: 403,
        message: "You don't have permission to delete this family member",
      };
    }

    await FamilyMember.findByIdAndDelete(memberId);

    return {
      success: true,
      statusCode: 200,
      message: 'Family member deleted successfully',
    };
  }

  /**
   * Get health data
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getHealth(userId) {
    const health = await Health.findOne({ userId }).populate('insurance.insuranceProvider');
    if (!health) {
      return {
        success: false,
        statusCode: 404,
        message: 'Health data not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Health data fetched successfully',
      data: health,
    };
  }
}

export const studentProfileService = new StudentProfileService();
export default studentProfileService;
