import Razorpay from "razorpay";
import dotenv from "dotenv";
dotenv.config();
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from "../config/environment.js"; 

let instance = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

// Create a Razorpay order and return payment link with QR
export const createPaymentLink = async (req, res) => {
  const { amount } = req.body;

  if (!amount) {
    return res.status(400).json({ message: "Amount is required" });
  }

  try {
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
      callback_url: "http://localhost:5173/payment-success",
      callback_method: "get",
    });

    res.status(200).json({ paymentLink: paymentLink.short_url, id: paymentLink.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create payment link" });
  }
};

// Check payment status
export const checkPaymentStatus = async (req, res) => {
  const { paymentLinkId } = req.params;

  try {
    const status = await instance.paymentLink.fetch(paymentLinkId);
    res.status(200).json({ status: status.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch payment status" });
  }
};
