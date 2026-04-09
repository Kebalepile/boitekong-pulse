import mongoose from "mongoose";

const { Schema } = mongoose;

const otpVerificationSchema = new Schema(
  {
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

export const OtpVerification = mongoose.model("OtpVerification", otpVerificationSchema);
