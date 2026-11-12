import mongoose, { Schema } from "mongoose";
const attachmentSchema = new Schema({
  filename: { type: String, required: true },
  contentType: { type: String, required: true },
  size: { type: Number, required: true },
  data: { type: Buffer, required: true, select: false },
});
const emailSchema = new Schema(
  {
    deliveryId: { type: String, required: true, unique: true },
    messageId: String,
    envelopeSender: String,
    envelopeRecipient: { type: String, required: true, index: true },
    from: String,
    to: String,
    cc: String,
    subject: String,
    text: String,
    sanitizedHtml: String,
    preview: String,
    attachments: [attachmentSchema],
    size: Number,
    receivedAt: { type: Date, required: true, index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);
emailSchema.index({ envelopeRecipient: 1, receivedAt: -1, _id: -1 });
export const Email =
  mongoose.models.Email || mongoose.model("Email", emailSchema);
const receiptSchema = new Schema({
  _id: String,
  completed: Boolean,
  receivedAt: Date,
  messageExpiresAt: Date,
  expiresAt: { type: Date, expires: 0 },
});
export const Receipt =
  mongoose.models.DeliveryReceipt ||
  mongoose.model("DeliveryReceipt", receiptSchema);
const lockSchema = new Schema({ _id: String, owner: String, until: Date });
export const IngestLock =
  mongoose.models.IngestLock || mongoose.model("IngestLock", lockSchema);
const rateSchema = new Schema({
  _id: String,
  count: Number,
  expiresAt: { type: Date, expires: 0 },
});
export const RateBucket =
  mongoose.models.RateBucket || mongoose.model("RateBucket", rateSchema);
export async function ensureIndexes() {
  await Promise.all([
    Email.createIndexes(),
    Receipt.createIndexes(),
    RateBucket.createIndexes(),
  ]);
}
