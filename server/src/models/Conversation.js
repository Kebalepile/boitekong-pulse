import mongoose from "mongoose";
import {
  bindConnectionModel,
  createUnboundModelPlaceholder
} from "./modelBinding.js";

const { Schema } = mongoose;

const clearedConversationStateSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    clearedAt: {
      type: Date,
      required: true
    }
  },
  {
    _id: false
  }
);

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
    clearedByUsers: {
      type: [clearedConversationStateSchema],
      default: []
    },
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

export let Conversation = createUnboundModelPlaceholder({
  modelName: "Conversation",
  collectionName: "conversations"
});

export function bindConversationModel(connection) {
  Conversation = bindConnectionModel(connection, "Conversation", conversationSchema);
  return Conversation;
}
