/**
 * Invoice Counter
 *
 * One document per invoice series (currently one per financial year), holding
 * the last serial issued. GST invoices have to run in an unbroken consecutive
 * series, so the serial is handed out by an atomic $inc — never derived from a
 * timestamp or an ObjectId, and never computed by counting existing invoices
 * (which would repeat a number after a deletion).
 */

import mongoose from "mongoose"

const InvoiceCounterSchema = new mongoose.Schema(
  {
    // Series key, e.g. "HCU/ACC/25-26".
    key: { type: String, required: true, unique: true, trim: true },
    lastSerial: { type: Number, default: 0 },
  },
  { timestamps: true }
)

const InvoiceCounter = mongoose.model("InvoiceCounter", InvoiceCounterSchema)
export default InvoiceCounter
