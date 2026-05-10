import mongoose from "mongoose";

const { Schema } = mongoose;

export const locationSchema = new Schema(
  {
    province: {
      type: String,
      default: "",
      trim: true
    },
    municipality: {
      type: String,
      default: "",
      trim: true
    },
    township: {
      type: String,
      required: true,
      trim: true
    },
    extension: {
      type: String,
      default: "",
      trim: true
    },
    area: {
      type: String,
      default: "",
      trim: true
    },
    streetName: {
      type: String,
      default: "",
      trim: true
    }
  },
  {
    _id: false
  }
);

export const voiceNoteSchema = new Schema(
  {
    audioData: {
      type: Buffer,
      default: undefined
    },
    encryptedAudioBase64: {
      type: String,
      default: ""
    },
    url: {
      type: String,
      default: ""
    },
    storageKey: {
      type: String,
      default: ""
    },
    mimeType: {
      type: String,
      default: "audio/webm"
    },
    durationSeconds: {
      type: Number,
      min: 0,
      default: 0
    },
    durationMs: {
      type: Number,
      min: 0,
      default: 0
    },
    sizeBytes: {
      type: Number,
      min: 0,
      default: 0
    },
    size: {
      type: Number,
      min: 0,
      default: 0
    },
    waveform: {
      type: [Number],
      default: undefined
    }
  },
  {
    _id: false
  }
);

export const reactionSchema = new Schema(
  {
    likeUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    mehUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    dislikeUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  {
    _id: false
  }
);

export const readReceiptSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    seenAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);
