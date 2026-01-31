/**
 * Payment Service
 * Handles Razorpay payment operations
 */

import Razorpay from "razorpay"

// Get env vars from process.env (avoiding circular dependency)
const getEnvConfig = () => ({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || ''
})

class PaymentService {
  constructor() {
    this._instance = null
  }

  /**
   * Get or create Razorpay instance
   */
  get razorpay() {
    if (!this._instance) {
      const config = getEnvConfig()
      this._instance = new Razorpay({
        key_id: config.keyId,
        key_secret: config.keySecret
      })
    }
    return this._instance
  }

  /**
   * Create a payment link
   * @param {Object} options Payment options
   * @param {number} options.amount Amount in rupees
   * @param {string} [options.description] Payment description
   * @param {Object} [options.customer] Customer details
   * @param {string} [options.callbackUrl] Callback URL after payment
   * @returns {Promise<{paymentLink: string, id: string}>}
   */
  async createPaymentLink({ 
    amount, 
    description = 'Hostel Payment', 
    customer = {},
    callbackUrl = null
  }) {
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount')
    }

    const paymentLinkOptions = {
      amount: amount * 100, // Razorpay expects amount in paise
      currency: "INR",
      accept_partial: false,
      description,
      customer: {
        name: customer.name || 'Hostel User',
        email: customer.email || 'user@example.com',
        contact: customer.phone || '9999999999'
      },
      notify: {
        sms: true,
        email: true
      },
      reminder_enable: true
    }

    if (callbackUrl) {
      paymentLinkOptions.callback_url = callbackUrl
      paymentLinkOptions.callback_method = 'get'
    }

    const paymentLink = await this.razorpay.paymentLink.create(paymentLinkOptions)

    return {
      paymentLink: paymentLink.short_url,
      id: paymentLink.id
    }
  }

  /**
   * Check payment status
   * @param {string} paymentLinkId Payment link ID
   * @returns {Promise<{status: string, paid: boolean, amount?: number}>}
   */
  async checkPaymentStatus(paymentLinkId) {
    if (!paymentLinkId) {
      throw new Error('Payment link ID is required')
    }

    const status = await this.razorpay.paymentLink.fetch(paymentLinkId)

    return {
      status: status.status,
      paid: status.status === 'paid',
      amount: status.amount_paid ? status.amount_paid / 100 : undefined,
      paidAt: status.paid_at ? new Date(status.paid_at * 1000) : undefined
    }
  }

  /**
   * Create an order
   * @param {Object} options Order options
   * @param {number} options.amount Amount in rupees
   * @param {string} [options.receipt] Receipt ID
   * @param {Object} [options.notes] Additional notes
   * @returns {Promise<Object>}
   */
  async createOrder({ amount, receipt, notes = {} }) {
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount')
    }

    const order = await this.razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: receipt || `order_${Date.now()}`,
      notes
    })

    return {
      orderId: order.id,
      amount: order.amount / 100,
      currency: order.currency
    }
  }

  /**
   * Verify payment signature
   * @param {Object} options Verification options
   * @param {string} options.orderId Razorpay order ID
   * @param {string} options.paymentId Razorpay payment ID
   * @param {string} options.signature Payment signature
   * @returns {boolean}
   */
  verifyPaymentSignature({ orderId, paymentId, signature }) {
    const crypto = require('crypto')
    const config = getEnvConfig()
    
    const body = orderId + '|' + paymentId
    const expectedSignature = crypto
      .createHmac('sha256', config.keySecret)
      .update(body.toString())
      .digest('hex')

    return expectedSignature === signature
  }

  /**
   * Fetch payment details
   * @param {string} paymentId Payment ID
   * @returns {Promise<Object>}
   */
  async fetchPayment(paymentId) {
    if (!paymentId) {
      throw new Error('Payment ID is required')
    }

    const payment = await this.razorpay.payments.fetch(paymentId)

    return {
      id: payment.id,
      amount: payment.amount / 100,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      email: payment.email,
      contact: payment.contact,
      createdAt: new Date(payment.created_at * 1000)
    }
  }

  /**
   * Refund a payment
   * @param {string} paymentId Payment ID
   * @param {number} [amount] Amount to refund (full refund if not specified)
   * @returns {Promise<Object>}
   */
  async refundPayment(paymentId, amount = null) {
    if (!paymentId) {
      throw new Error('Payment ID is required')
    }

    const refundOptions = {}
    if (amount) {
      refundOptions.amount = amount * 100
    }

    const refund = await this.razorpay.payments.refund(paymentId, refundOptions)

    return {
      id: refund.id,
      amount: refund.amount / 100,
      status: refund.status
    }
  }
}

// Export singleton instance
export const paymentService = new PaymentService()
export default paymentService
