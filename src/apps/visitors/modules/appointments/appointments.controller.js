import { asyncHandler } from "../../../../utils/index.js";
import { appointmentsService } from "./appointments.service.js";

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

export const submitPublicAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentsService.submitPublicAppointment(req.body);
  sendWithError(res, result);
});

export const getPublicAppointmentTargets = asyncHandler(async (req, res) => {
  const result = await appointmentsService.getPublicTargets();
  sendWithError(res, result);
});

export const getAdminAppointments = asyncHandler(async (req, res) => {
  const result = await appointmentsService.getAdminAppointments(req.user, req.query);
  sendWithError(res, result);
});

export const getAdminAppointmentById = asyncHandler(async (req, res) => {
  const result = await appointmentsService.getAdminAppointmentById(
    req.user,
    req.params.appointmentId
  );
  sendWithError(res, result);
});

export const reviewAppointment = asyncHandler(async (req, res) => {
  const result = await appointmentsService.reviewAppointment(
    req.user,
    req.params.appointmentId,
    req.body
  );
  sendWithError(res, result);
});

export const getMyAppointmentAvailability = asyncHandler(async (req, res) => {
  const result = await appointmentsService.getMyAvailability(req.user);
  sendWithError(res, result);
});

export const updateMyAppointmentAvailability = asyncHandler(async (req, res) => {
  const result = await appointmentsService.updateMyAvailability(req.user, req.body);
  sendWithError(res, result);
});

export const getGateAppointments = asyncHandler(async (req, res) => {
  const result = await appointmentsService.getGateAppointments(req.user, req.query);
  sendWithError(res, result);
});

export const markGateAppointmentEntry = asyncHandler(async (req, res) => {
  const result = await appointmentsService.markGateEntry(
    req.user,
    req.params.appointmentId,
    req.body
  );
  sendWithError(res, result);
});
