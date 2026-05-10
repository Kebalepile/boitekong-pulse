import mongoose from "mongoose";
import {
  bindConnectionModel,
  createUnboundModelPlaceholder
} from "./modelBinding.js";

const { Schema } = mongoose;

const liveStreamSchema = new Schema(
  {
    broadcasterId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100
    },
    coverImageUrl: {
      type: String,
      default: ""
    },
    status: {
      type: String,
      enum: ["active", "ended"],
      default: "active",
      index: true
    },
    startTime: {
      type: Date,
      default: Date.now
    },
    endTime: {
      type: Date,
      default: null
    },
    viewerCount: {
      type: Number,
      min: 0,
      default: 0
    },
    peakViewerCount: {
      type: Number,
      min: 0,
      default: 0
    },
    signalingTokens: [
      {
        viewerId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true
        },
        tokenHash: {
          type: String,
          required: true
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    viewerModeration: [
      {
        viewerId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true
        },
        strikes: {
          type: Number,
          min: 0,
          default: 0
        },
        kickedAt: {
          type: Date,
          default: null
        },
        mutedAt: {
          type: Date,
          default: null
        },
        updatedAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

liveStreamSchema.index({ broadcasterId: 1, status: 1 });
liveStreamSchema.index({ status: 1, createdAt: -1 });

export let LiveStream = createUnboundModelPlaceholder({
  modelName: "LiveStream",
  collectionName: "livestreams"
});

export function bindLiveStreamModel(connection) {
  LiveStream = bindConnectionModel(connection, "LiveStream", liveStreamSchema);
  return LiveStream;
}
