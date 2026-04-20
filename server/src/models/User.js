import mongoose from "mongoose";
import {
  bindConnectionModel,
  createUnboundModelPlaceholder
} from "./modelBinding.js";
import { locationSchema } from "./shared.js";

const { Schema } = mongoose;

const directMessagePrivateKeyEnvelopeSchema = new Schema(
  {
    version: {
      type: String,
      default: ""
    },
    algorithm: {
      type: String,
      default: ""
    },
    ciphertext: {
      type: String,
      default: ""
    },
    iv: {
      type: String,
      default: ""
    },
    salt: {
      type: String,
      default: ""
    },
    iterations: {
      type: Number,
      default: 0
    }
  },
  {
    _id: false
  }
);

const directMessageKeyRecordShape = {
  version: {
    type: String,
    default: ""
  },
  algorithm: {
    type: String,
    default: ""
  },
  keyId: {
    type: String,
    default: ""
  },
  publicKeyJwk: {
    type: Schema.Types.Mixed,
    default: null
  },
  privateKeyEnvelope: {
    type: directMessagePrivateKeyEnvelopeSchema,
    default: null
  },
  updatedAt: {
    type: Date,
    default: null
  }
};

const directMessageKeyRecordSchema = new Schema(directMessageKeyRecordShape, {
  _id: false
});

const directMessageEncryptionSchema = new Schema(
  {
    ...directMessageKeyRecordShape,
    previousKeys: {
      type: [directMessageKeyRecordSchema],
      default: []
    }
  },
  {
    _id: false
  }
);

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
    directMessageEncryption: {
      type: directMessageEncryptionSchema,
      default: null
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
    lastForgotPasswordResetAt: {
      type: Date,
      default: null
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

export let User = createUnboundModelPlaceholder({
  modelName: "User",
  collectionName: "users"
});

export function bindUserModel(connection) {
  User = bindConnectionModel(connection, "User", userSchema);
  return User;
}
