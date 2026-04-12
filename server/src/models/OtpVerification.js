import mongoose from "mongoose";

const { Schema } = mongoose;

const otpVerificationSchema = new Schema(
  {
    purpose: {
      type: String,
      enum: ["phone_verification", "password_reset", "registration"],
      default: "phone_verification",
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    phoneNumber: {
      type: String,
      required: true,
      index: true
    },
    otpCodeHash: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    attemptCount: {
      type: Number,
      min: 0,
      default: 0
    },
    cooldownUntil: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpVerificationSchema.index({ phoneNumber: 1, purpose: 1, createdAt: -1 });

export const OtpVerification = mongoose.model("OtpVerification", otpVerificationSchema);
