import mongoose from "mongoose";
import { locationSchema } from "./shared.js";

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30
    },
    usernameLower: {
      type: String,
      required: true,
      unique: true,
      index: true,
      select: false
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    avatarUrl: {
      type: String,
      default: ""
    },
    location: {
      type: locationSchema,
      required: true
    },
    directMessagesEnabled: {
      type: Boolean,
      default: true
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    blockedUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    followingUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    phoneVerified: {
      type: Boolean,
      default: false
    },
    lastSeen: {
      type: Date,
      default: null
    },
    roles: {
      type: [String],
      default: ["user"]
    }
  },
  {
    timestamps: true
  }
);

export const User = mongoose.model("User", userSchema);
