/**
 * Student Profile Service
 * Business logic for student profile self-service operations
 * @module services/studentProfile
 */

import { success, notFound, badRequest, forbidden } from '../../../../services/base/ServiceResponse.js';
import { studentProfileOwner } from '../../../../services/student/studentProfileOwner.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { User } from '../../../../models/index.js';
import { familyOwner } from '../../../../services/family/familyOwner.service.js';
import { familyQueries } from '../../../../services/family/familyQueries.service.js';
import { getConfigWithDefault } from '../../../../utils/configDefaults.js';
import { healthOwner } from '../../../../services/health/healthOwner.service.js';
import { healthQueries } from '../../../../services/health/healthQueries.service.js';
import { toDateOnly } from '../../../../utils/utils.js';

const toStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
};

class StudentProfileService {

  resolveEditableFields(defaultEditableFields) {
    return toStringArray(defaultEditableFields).map((field) => (
      field === 'alumniEmailId' ? 'secondaryEmail' : field
    ));
  }

  /**
   * Get editable profile fields for a student
   */
  async getEditableProfile(userId, currentUser) {
    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = this.resolveEditableFields(config?.value || ['profileImage', 'dateOfBirth']);

    const studentProfile = await studentProfileQueries.findByUserIdWithUserContact(userId);

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const editableProfile = {};
    const health = await healthQueries.findByUser(userId);

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
          editableProfile.dateOfBirth = toDateOnly(studentProfile.dateOfBirth) || '';
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
        case 'secondaryEmail':
          editableProfile.secondaryEmail = studentProfile.secondaryEmail || '';
          break;
        case 'bloodGroup':
          editableProfile.bloodGroup = health?.bloodGroup || '';
          break;
        case 'admissionDate':
          editableProfile.admissionDate = toDateOnly(studentProfile.admissionDate) || '';
          break;
      }
    });

    return success({ editableProfile, editableFields });
  }

  /**
   * Update student profile
   */
  async updateStudentProfile(userId, body, currentUser) {
    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = this.resolveEditableFields(config?.value || ['profileImage', 'dateOfBirth']);

    const studentProfile = await studentProfileQueries.findByUserId(userId);
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
            const normalized = toDateOnly(body.dateOfBirth);
            if (normalized !== undefined) updates.dateOfBirth = normalized;
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
        case 'secondaryEmail':
          if (editableFields.includes('secondaryEmail')) updates.secondaryEmail = body.secondaryEmail;
          break;
        case 'bloodGroup':
          if (editableFields.includes('bloodGroup')) updates.bloodGroup = body.bloodGroup;
          break;
        case 'admissionDate':
          if (editableFields.includes('admissionDate')) {
            const normalized = toDateOnly(body.admissionDate);
            if (normalized !== undefined) updates.admissionDate = normalized;
          }
          break;
      }
    });

    if (updates.bloodGroup) {
      await healthOwner.setBloodGroupByUser(userId, updates.bloodGroup);
    }

    if (Object.keys(updates).length > 0) {
      await studentProfileOwner.updateOne({ _id: studentProfile._id }, { $set: updates });
    }

    if (Object.keys(userUpdates).length > 0) {
      await User.updateOne({ _id: userId }, { $set: userUpdates });
    }

    if (Object.keys(updates).length === 0 && Object.keys(userUpdates).length === 0) {
      return badRequest("No valid updates provided or you don't have permission to update these fields");
    }

    const updatedProfile = await studentProfileQueries.getFullStudentData(userId);

    return success({ profile: updatedProfile, editableFields }, 200, 'Profile updated successfully');
  }

  /**
   * Get student profile
   */
  async getStudentProfile(userId, currentUser) {
    const profile = await studentProfileQueries.getFullStudentData(userId);

    if (!profile) {
      return notFound('Student profile');
    }

    const config = await getConfigWithDefault('studentEditableFields');
    const editableFields = this.resolveEditableFields(config?.value || ['profileImage', 'dateOfBirth']);

    return success({ profile, editableFields });
  }

  /**
   * Get family members
   */
  async getFamilyMembers(userId) {
    const familyMembers = await familyQueries.findByUserId(userId);
    return success(familyMembers, 200, 'Family members fetched successfully');
  }

  /**
   * Add family member
   */
  async addFamilyMember(userId, { name, relationship, phone, email, address }) {
    const familyMember = await familyOwner.create({ userId, name, relationship, phone, email, address });
    return success(familyMember, 201, 'Family member added successfully');
  }

  /**
   * Update family member
   */
  async updateFamilyMember(userId, memberId, { name, relationship, phone, email, address }) {
    const familyMember = await familyQueries.findById(memberId);
    if (!familyMember) {
      return notFound('Family member');
    }

    if (familyMember.userId.toString() !== userId) {
      return forbidden("You don't have permission to update this family member");
    }

    const updatedFamilyMember = await familyOwner.updateById(memberId, {
      name,
      relationship,
      phone,
      email,
      address,
    });

    return success(updatedFamilyMember, 200, 'Family member updated successfully');
  }

  /**
   * Delete family member
   */
  async deleteFamilyMember(userId, memberId) {
    const familyMember = await familyQueries.findById(memberId);
    if (!familyMember) {
      return notFound('Family member');
    }

    if (familyMember.userId.toString() !== userId) {
      return forbidden("You don't have permission to delete this family member");
    }

    await familyOwner.deleteById(memberId);

    return success(null, 200, 'Family member deleted successfully');
  }

  /**
   * Get health data
   */
  async getHealth(userId) {
    const health = await healthQueries.findByUserWithProvider(userId);
    if (!health) {
      return notFound('Health data');
    }

    return success(health, 200, 'Health data fetched successfully');
  }
}

export const studentProfileService = new StudentProfileService();
export default studentProfileService;
