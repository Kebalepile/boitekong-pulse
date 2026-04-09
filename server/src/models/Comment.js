import mongoose from "mongoose";
import { reactionSchema, voiceNoteSchema } from "./shared.js";

const { Schema } = mongoose;

const commentSchema = new Schema(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300
    },
    voiceNote: {
      type: voiceNoteSchema,
      default: null
    },
    reactions: {
      type: reactionSchema,
      default: () => ({})
    },
    deletedAt: {
      type: Date,
      default: null
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

commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ parentId: 1, createdAt: 1 });
commentSchema.index({ userId: 1, createdAt: -1 });

export const Comment = mongoose.model("Comment", commentSchema);
