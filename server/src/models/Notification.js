import mongoose from "mongoose";
import {
  bindConnectionModel,
  createUnboundModelPlaceholder
} from "./modelBinding.js";

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    type: {
      type: String,
      enum: [
        "system",
        "dm",
        "follow",
        "post_comment",
        "comment_reply",
        "post_reaction",
        "comment_reaction",
        "report_update"
      ],
      default: "system"
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: "Post",
      default: null
    },
    commentId: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
      default: null
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      default: null
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },
    title: {
      type: String,
      default: "",
      trim: true
    },
    text: {
      type: String,
      default: "",
      trim: true
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export let Notification = createUnboundModelPlaceholder({
  modelName: "Notification",
  collectionName: "notifications"
});

export function bindNotificationModel(connection) {
  Notification = bindConnectionModel(connection, "Notification", notificationSchema);
  return Notification;
}
