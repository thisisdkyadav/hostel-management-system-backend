import Razorpay from "razorpay"
const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})

export const formatDate = (dateStr) => {
  const [day, month, year] = dateStr ? dateStr.split("-").map(Number) : [null, null, null]
  const newDate = year && month && day ? new Date(year, month - 1, day) : null
  return newDate
}

export const createPaymentLink = async (amount) => {
  console.log("Creating payment link with amount:", amount)

  const paymentLink = await instance.paymentLink.create({
    amount: amount * 100,
    currency: "INR",
    accept_partial: false,
    description: "Hostel Room Payment",
    reminder_enable: true,
    callback_url: "http://localhost:5000/payment-success",
    callback_method: "get",
  })

  return { paymentLink: paymentLink.short_url, paymentId: paymentLink.id }
}

export const checkPaymentStatus = async (paymentId) => {
  try {
    const payment = await instance.paymentLink.fetch(paymentId)
    return payment.status
  } catch (error) {
    console.error("Error checking payment status:", error)
    return null
  }
}
