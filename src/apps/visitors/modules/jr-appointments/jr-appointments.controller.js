import { asyncHandler } from "../../../../utils/index.js";
import { jrAppointmentsService } from "./jr-appointments.service.js";

const sendWithError = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    });
  }

  if (result.message && result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
    return res.status(result.statusCode).json({
      ...result.data,
      message: result.message,
    });
  }

  return res.status(result.statusCode).json(result.data);
};

export const submitPublicJRAppointment = asyncHandler(async (req, res) => {
  const result = await jrAppointmentsService.submitPublicAppointment(req.body);
  sendWithError(res, result);
});

export const getAdminJRAppointments = asyncHandler(async (req, res) => {
  const result = await jrAppointmentsService.getAdminAppointments(req.user, req.query);
  sendWithError(res, result);
});

export const getAdminJRAppointmentById = asyncHandler(async (req, res) => {
  const result = await jrAppointmentsService.getAdminAppointmentById(
    req.user,
    req.params.appointmentId
  );
  sendWithError(res, result);
});

export const reviewJRAppointment = asyncHandler(async (req, res) => {
  const result = await jrAppointmentsService.reviewAppointment(
    req.user,
    req.params.appointmentId,
    req.body
  );
  sendWithError(res, result);
});

export const getGateJRAppointments = asyncHandler(async (req, res) => {
  const result = await jrAppointmentsService.getGateAppointments(req.user, req.query);
  sendWithError(res, result);
});

export const markGateJRAppointmentEntry = asyncHandler(async (req, res) => {
  const result = await jrAppointmentsService.markGateEntry(
    req.user,
    req.params.appointmentId,
    req.body
  );
  sendWithError(res, result);
});
