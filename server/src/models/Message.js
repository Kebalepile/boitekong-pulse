import mongoose from "mongoose";
import {
  bindConnectionModel,
  createUnboundModelPlaceholder
} from "./modelBinding.js";
import { readReceiptSchema, voiceNoteSchema } from "./shared.js";

const { Schema } = mongoose;

const messageEncryptionSchema = new Schema(
  {
    version: {
      type: String,
      default: ""
    },
    algorithm: {
      type: String,
      default: ""
    },
    iv: {
      type: String,
      default: ""
    },
    senderKeyId: {
      type: String,
      default: ""
    },
    recipientKeyId: {
      type: String,
      default: ""
    },
    senderPublicKeyJwk: {
      type: Schema.Types.Mixed,
      default: null
    },
    recipientPublicKeyJwk: {
      type: Schema.Types.Mixed,
      default: null
    }
  },
  {
    _id: false
  }
);

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
    replyToMessageId: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null,
      index: true
    },
    isForwarded: {
      type: Boolean,
      default: false
    },
    clientRequestId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 128
    },
    text: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000
    },
    encryptedText: {
      type: String,
      default: "",
      maxlength: 8192
    },
    encryption: {
      type: messageEncryptionSchema,
      default: null
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
messageSchema.index(
  { conversationId: 1, senderId: 1, clientRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      clientRequestId: {
        $type: "string"
      }
    }
  }
);

export let Message = createUnboundModelPlaceholder({
  modelName: "Message",
  collectionName: "messages"
});

export function bindMessageModel(connection) {
  Message = bindConnectionModel(connection, "Message", messageSchema);
  return Message;
}
