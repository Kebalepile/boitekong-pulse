import mongoose from "mongoose";
import { readReceiptSchema, voiceNoteSchema } from "./shared.js";

const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    voiceNote: {
      type: voiceNoteSchema,
      default: null
    },
    editedAt: {
      type: Date,
      default: null
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedForEveryone: {
      type: Boolean,
      default: false
    },
    readBy: {
      type: [readReceiptSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ senderId: 1, createdAt: -1 });

export const Message = mongoose.model("Message", messageSchema);
