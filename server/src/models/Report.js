import mongoose from "mongoose";
import {
  bindConnectionModel,
  createUnboundModelPlaceholder
} from "./modelBinding.js";

const { Schema } = mongoose;

const reportSchema = new Schema(
  {
    reporterUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    targetType: {
      type: String,
      enum: ["post", "comment", "message", "user"],
      required: true
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120
    },
    hideForReporter: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ["submitted", "under_review", "resolved", "dismissed"],
      default: "submitted"
    },
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    decision: {
      type: String,
      default: ""
    },
    decisionNote: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

reportSchema.index(
  {
    reporterUserId: 1,
    targetType: 1,
    targetId: 1
  },
  {
    unique: true
  }
);

reportSchema.index({ status: 1, createdAt: -1 });

export let Report = createUnboundModelPlaceholder({
  modelName: "Report",
  collectionName: "reports"
});

export function bindReportModel(connection) {
  Report = bindConnectionModel(connection, "Report", reportSchema);
  return Report;
}
