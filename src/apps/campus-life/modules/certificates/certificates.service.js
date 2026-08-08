/**
 * Certificate Service
 * Handles student certificate operations
 *
 * @module services/certificate.service
 */

import { StudentProfile } from '../../../../models/index.js';
import { success, notFound, error, conflict } from '../../../../services/base/index.js';
import { certificateOwner } from '../../../../services/certificate/certificateOwner.service.js';
import { certificateQueries } from '../../../../services/certificate/certificateQueries.service.js';

const ENTITY = 'Certificate';

class CertificateService {
  /**
   * Add certificate for a student
   * @param {Object} data - Certificate data with studentId
   */
  async addCertificate(data) {
    const { studentId, certificateType, certificateUrl, issueDate, remarks } = data;

    // Verify student exists
    const studentProfile = await StudentProfile.findOne({ userId: studentId });
    if (!studentProfile) {
      return notFound('Student profile');
    }

    let certificate;
    try {
      certificate = await certificateOwner.createCertificate({
        userId: studentId,
        certificateType,
        certificateUrl,
        issueDate,
        remarks,
      });
    } catch (err) {
      if (err.code === 11000) {
        return conflict(`${ENTITY} already exists`);
      }
      return error(`Failed to create ${ENTITY}`, 500, err.message);
    }

    return success(
      { message: 'Certificate added successfully', certificate },
      201
    );
  }

  /**
   * Get all certificates for a student
   * @param {string} studentId - Student user ID
   */
  async getCertificatesByStudent(studentId) {
    try {
      const certificates = await certificateQueries.findCertificatesByUser(studentId);
      return success({
        success: true,
        message: 'Certificates fetched successfully',
        certificates,
      });
    } catch (err) {
      return error(`Failed to fetch ${ENTITY}s`, 500, err.message);
    }
  }

  /**
   * Update a certificate
   * @param {string} certificateId - Certificate ID
   * @param {Object} data - Update data
   */
  async updateCertificate(certificateId, data) {
    let certificate;
    try {
      certificate = await certificateOwner.updateCertificate(certificateId, data);
    } catch (err) {
      return error(`Failed to update ${ENTITY}`, 500, err.message);
    }

    if (!certificate) {
      return notFound(ENTITY);
    }
    return success({ message: 'Certificate updated successfully', certificate });
  }

  /**
   * Delete a certificate
   * @param {string} certificateId - Certificate ID
   */
  async deleteCertificate(certificateId) {
    let deleted;
    try {
      deleted = await certificateOwner.deleteCertificate(certificateId);
    } catch (err) {
      return error(`Failed to delete ${ENTITY}`, 500, err.message);
    }

    if (!deleted) {
      return notFound(ENTITY);
    }
    return success({ message: 'Certificate deleted successfully' });
  }
}

export const certificateService = new CertificateService();
