import { bindCommentModel, Comment } from "./Comment.js";
import { bindConversationModel, Conversation } from "./Conversation.js";
import { bindMessageModel, Message } from "./Message.js";
import { bindNotificationModel, Notification } from "./Notification.js";
import {
  bindOtpVerificationModel,
  OtpVerification
} from "./OtpVerification.js";
import { bindPostModel, Post } from "./Post.js";
import { bindReportModel, Report } from "./Report.js";
import { bindUserModel, User } from "./User.js";

export const DATABASE_ALIASES = Object.freeze({
  CORE: "core",
  CONTENT: "content",
  MESSAGING: "messaging",
  NOTIFICATIONS: "notifications"
});

const modelBindingDescriptors = [
  {
    modelName: "User",
    databaseAlias: DATABASE_ALIASES.CORE,
    bind: bindUserModel,
    getModel: () => User
  },
  {
    modelName: "OtpVerification",
    databaseAlias: DATABASE_ALIASES.CORE,
    bind: bindOtpVerificationModel,
    getModel: () => OtpVerification
  },
  {
    modelName: "Report",
    databaseAlias: DATABASE_ALIASES.CORE,
    bind: bindReportModel,
    getModel: () => Report
  },
  {
    modelName: "Post",
    databaseAlias: DATABASE_ALIASES.CONTENT,
    bind: bindPostModel,
    getModel: () => Post
  },
  {
    modelName: "Comment",
    databaseAlias: DATABASE_ALIASES.CONTENT,
    bind: bindCommentModel,
    getModel: () => Comment
  },
  {
    modelName: "Notification",
    databaseAlias: DATABASE_ALIASES.NOTIFICATIONS,
    bind: bindNotificationModel,
    getModel: () => Notification
  },
  {
    modelName: "Conversation",
    databaseAlias: DATABASE_ALIASES.MESSAGING,
    bind: bindConversationModel,
    getModel: () => Conversation
  },
  {
    modelName: "Message",
    databaseAlias: DATABASE_ALIASES.MESSAGING,
    bind: bindMessageModel,
    getModel: () => Message
  }
];

let boundModelDescriptors = [];

export function bindRegisteredModels(databaseConnections, { partitioned = false } = {}) {
  const coreConnection = databaseConnections.get(DATABASE_ALIASES.CORE);

  if (!coreConnection) {
    throw new Error("Core MongoDB connection is required before binding models.");
  }

  boundModelDescriptors = modelBindingDescriptors.map((descriptor) => {
    const activeAlias = partitioned ? descriptor.databaseAlias : DATABASE_ALIASES.CORE;
    const connection = databaseConnections.get(activeAlias) || coreConnection;
    const model = descriptor.bind(connection);

    return {
      ...descriptor,
      activeAlias,
      connectionName: connection.name,
      model
    };
  });

  return boundModelDescriptors;
}

export function getBoundModelDescriptors() {
  return [...boundModelDescriptors];
}

export function getRegisteredModels() {
  return getBoundModelDescriptors().map((descriptor) => descriptor.model);
}
