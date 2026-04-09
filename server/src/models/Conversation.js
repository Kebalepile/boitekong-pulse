import mongoose from "mongoose";

const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    participantIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
      }
    ],
    archivedByUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    lastMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },
    lastMessageAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

conversationSchema.index({ participantIds: 1, updatedAt: -1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
