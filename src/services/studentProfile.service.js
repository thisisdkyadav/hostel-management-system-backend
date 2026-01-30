/**
 * Student Profile Service
 * Business logic for student profile self-service operations
 * @module services/studentProfile
 */

import BaseService from './base/BaseService.js';
import { success, notFound, badRequest, forbidden } from './base/ServiceResponse.js';
import { StudentProfile } from '../models/index.js';
import { User } from '../models/index.js';
import { FamilyMember } from '../models/index.js';
import { getConfigWithDefault } from '../utils/configDefaults.js';
import { Health } from '../models/index.js';

class StudentProfileService extends BaseService {
  constructor() {
    super(StudentProfile);
  }

  /**
   * Get editable profile fields for a student
   */
  async getEditableProfile(userId) {
    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = config?.value || ['profileImage', 'dateOfBirth'];

    const studentProfile = await this.model.findOne({ userId }).populate(
      'userId',
      'name email profileImage phone'
    );

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const editableProfile = {};
    const health = await Health.findOne({ userId });

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

    return success({ editableProfile, editableFields });
  }

  /**
   * Update student profile
   */
  async updateStudentProfile(userId, body) {
    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = config?.value || ['profileImage', 'dateOfBirth'];

    const studentProfile = await this.model.findOne({ userId });
    if (!studentProfile) {
      return notFound('Student profile');
    }

    const user = await User.findById(userId);
    if (!user) {
      return notFound('User');
    }

    const updates = {};
    const userUpdates = {};

    Object.keys(body).forEach((field) => {
      if (body[field] === null || body[field] === undefined) return;

      switch (field) {
        case 'name':
          if (editableFields.includes('name')) userUpdates.name = body.name;
          break;
        case 'profileImage':
          if (editableFields.includes('profileImage')) userUpdates.profileImage = body.profileImage;
          break;
        case 'phone':
          if (editableFields.includes('phone')) userUpdates.phone = body.phone;
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
              if (!isNaN(date.getTime())) updates.dateOfBirth = date;
            } catch (err) {
              // Invalid date, ignore
            }
          }
          break;
        case 'address':
          if (editableFields.includes('address')) updates.address = body.address;
          break;
        case 'emergencyContact':
          if (editableFields.includes('emergencyContact')) {
            updates.guardian = body.emergencyContact.guardian;
            updates.guardianPhone = body.emergencyContact.guardianPhone;
            updates.guardianEmail = body.emergencyContact.guardianEmail;
          }
          break;
        case 'bloodGroup':
          if (editableFields.includes('bloodGroup')) updates.bloodGroup = body.bloodGroup;
          break;
        case 'admissionDate':
          if (editableFields.includes('admissionDate')) updates.admissionDate = body.admissionDate;
          break;
      }
    });

    if (updates.bloodGroup) {
      await Health.updateOne({ userId }, { $set: { bloodGroup: updates.bloodGroup } });
    }

    if (Object.keys(updates).length > 0) {
      await this.model.updateOne({ _id: studentProfile._id }, { $set: updates });
    }

    if (Object.keys(userUpdates).length > 0) {
      await User.updateOne({ _id: userId }, { $set: userUpdates });
    }

    if (Object.keys(updates).length === 0 && Object.keys(userUpdates).length === 0) {
      return badRequest("No valid updates provided or you don't have permission to update these fields");
    }

    const updatedProfile = await this.model.getFullStudentData(userId);

    return success({ profile: updatedProfile, editableFields }, 200, 'Profile updated successfully');
  }

  /**
   * Get student profile
   */
  async getStudentProfile(userId) {
    const profile = await this.model.getFullStudentData(userId);

    if (!profile) {
      return notFound('Student profile');
    }

    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = config?.value || ['profileImage', 'dateOfBirth'];

    return success({ profile, editableFields });
  }

  /**
   * Get family members
   */
  async getFamilyMembers(userId) {
    const familyMembers = await FamilyMember.find({ userId });
    return success(familyMembers, 200, 'Family members fetched successfully');
  }

  /**
   * Add family member
   */
  async addFamilyMember(userId, { name, relationship, phone, email, address }) {
    const familyMember = await FamilyMember.create({ userId, name, relationship, phone, email, address });
    return success(familyMember, 201, 'Family member added successfully');
  }

  /**
   * Update family member
   */
  async updateFamilyMember(userId, memberId, { name, relationship, phone, email, address }) {
    const familyMember = await FamilyMember.findById(memberId);
    if (!familyMember) {
      return notFound('Family member');
    }

    if (familyMember.userId.toString() !== userId) {
      return forbidden("You don't have permission to update this family member");
    }

    const updatedFamilyMember = await FamilyMember.findByIdAndUpdate(
      memberId,
      { name, relationship, phone, email, address },
      { new: true }
    );

    return success(updatedFamilyMember, 200, 'Family member updated successfully');
  }

  /**
   * Delete family member
   */
  async deleteFamilyMember(userId, memberId) {
    const familyMember = await FamilyMember.findById(memberId);
    if (!familyMember) {
      return notFound('Family member');
    }

    if (familyMember.userId.toString() !== userId) {
      return forbidden("You don't have permission to delete this family member");
    }

    await FamilyMember.findByIdAndDelete(memberId);

    return success(null, 200, 'Family member deleted successfully');
  }

  /**
   * Get health data
   */
  async getHealth(userId) {
    const health = await Health.findOne({ userId }).populate('insurance.insuranceProvider');
    if (!health) {
      return notFound('Health data');
    }

    return success(health, 200, 'Health data fetched successfully');
  }
}

export const studentProfileService = new StudentProfileService();
export default studentProfileService;
