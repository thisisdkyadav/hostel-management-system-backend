/**
 * Certificate Service
 * Handles student certificate operations
 * 
 * @module services/certificate.service
 */

import { Certificate } from '../../../../models/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { BaseService, success, notFound, PRESETS } from '../../../../services/base/index.js';

class CertificateService extends BaseService {
  constructor() {
    super(Certificate, 'Certificate');
  }

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

    const result = await this.create({
      userId: studentId,
      certificateType,
      certificateUrl,
      issueDate,
      remarks,
    });

    if (result.success) {
      return success(
        { message: 'Certificate added successfully', certificate: result.data },
        201
      );
    }
    return result;
  }

  /**
   * Get all certificates for a student
   * @param {string} studentId - Student user ID
   */
  async getCertificatesByStudent(studentId) {
    const result = await this.findAll(
      { userId: studentId },
      { populate: PRESETS.CERTIFICATE }
    );

    if (result.success) {
      return success({
        success: true,
        message: 'Certificates fetched successfully',
        certificates: result.data,
      });
    }
    return result;
  }

  /**
   * Update a certificate
   * @param {string} certificateId - Certificate ID
   * @param {Object} data - Update data
   */
  async updateCertificate(certificateId, data) {
    const result = await this.updateById(certificateId, data);
    if (result.success) {
      return success({ message: 'Certificate updated successfully', certificate: result.data });
    }
    return result;
  }

  /**
   * Delete a certificate
   * @param {string} certificateId - Certificate ID
   */
  async deleteCertificate(certificateId) {
    const result = await this.deleteById(certificateId);
    if (result.success) {
      return success({ message: 'Certificate deleted successfully' });
    }
    return result;
  }
}

export const certificateService = new CertificateService();
