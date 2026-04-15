import mongoose from "mongoose";
import { locationSchema, reactionSchema, voiceNoteSchema } from "./shared.js";

const { Schema } = mongoose;

const postSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    clientRequestId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 128
    },
    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000
    },
    imageUrl: {
      type: String,
      default: ""
    },
    voiceNote: {
      type: voiceNoteSchema,
      default: null
    },
    location: {
      type: locationSchema,
      required: true
    },
    reactions: {
      type: reactionSchema,
      default: () => ({})
    },
    commentCount: {
      type: Number,
      min: 0,
      default: 0
    },
    status: {
      type: String,
      enum: ["active", "deleted", "removed"],
      default: "active"
    }
  },
  {
    timestamps: true
  }
);

postSchema.index({ createdAt: -1 });
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index(
  { userId: 1, clientRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientRequestId: {
        $type: "string"
      }
    }
  }
);

export const Post = mongoose.model("Post", postSchema);
