import Razorpay from "razorpay";
import dotenv from "dotenv";
dotenv.config();
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from "../config/env.config.js";
import { asyncHandler } from "../utils/index.js";

let instance = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Create a Razorpay order and return payment link with QR
export const createPaymentLink = asyncHandler(async (req, res) => {
  const { amount } = req.body;

  if (!amount) {
    return res.status(400).json({ message: "Amount is required" });
  }

  const paymentLink = await instance.paymentLink.create({
    amount: amount * 100, 
    currency: "INR",
    accept_partial: false,
    description: "Hostel Room Payment",
    customer: {
      name: "Hostel User",
      email: "user@example.com", 
      contact: "9999999999",
    },
    notify: {
      sms: true,
      email: true,
    },
    reminder_enable: true,
    callback_url: "http://localhost:5000/payment-success",
    callback_method: "get",
  });

  res.status(200).json({ paymentLink: paymentLink.short_url, id: paymentLink.id });
});

// Check payment status
export const checkPaymentStatus = asyncHandler(async (req, res) => {
  const { paymentLinkId } = req.params;

  const status = await instance.paymentLink.fetch(paymentLinkId);
  res.status(200).json({ status: status.status });
});
