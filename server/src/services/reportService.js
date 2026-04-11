import mongoose from "mongoose";
import { Comment } from "../models/Comment.js";
import { Post } from "../models/Post.js";
import { Report } from "../models/Report.js";
import { AppError } from "../utils/appError.js";
import { validateReportNote, validateReportReason } from "../utils/validators.js";

function makeObjectIdError(field, message) {
  return new AppError(message, {
    statusCode: 400,
    code: "OBJECT_ID_INVALID",
    field
  });
}

function assertObjectId(value, field) {
  if (!mongoose.isValidObjectId(value)) {
    throw makeObjectIdError(field, `${field} is invalid.`);
  }
}

function toIdString(value) {
  return value ? String(value) : "";
}

function validateReportTargetType(value) {
  const targetType = typeof value === "string" ? value.trim() : "";

  if (!["post", "comment"].includes(targetType)) {
    throw new AppError("Could not report this item.", {
      statusCode: 400,
      code: "REPORT_TARGET_TYPE_INVALID",
      field: "targetType"
    });
  }

  return targetType;
}

function serializeReport(report) {
  const safeReport = typeof report?.toObject === "function" ? report.toObject() : report;

  return {
    id: toIdString(safeReport?._id),
    reporterUserId: toIdString(safeReport?.reporterUserId),
    targetType: safeReport?.targetType === "comment" ? "comment" : "post",
    targetId: toIdString(safeReport?.targetId),
    reason: safeReport?.reason || "",
    note: safeReport?.note || "",
    hideForReporter: safeReport?.hideForReporter === true,
    status: safeReport?.status || "submitted",
    createdAt: safeReport?.createdAt || new Date().toISOString(),
    updatedAt: safeReport?.updatedAt || null
  };
}

async function requireActiveReportTarget(targetType, targetId) {
  assertObjectId(targetId, "targetId");

  if (targetType === "comment") {
    const comment = await Comment.findOne({
      _id: targetId,
      status: "active"
    }).select("_id");

    if (!comment) {
      throw new AppError("Comment not found.", {
        statusCode: 404,
        code: "COMMENT_NOT_FOUND"
      });
    }

    return comment;
  }

  const post = await Post.findOne({
    _id: targetId,
    status: "active"
  }).select("_id");

  if (!post) {
    throw new AppError("Post not found.", {
      statusCode: 404,
      code: "POST_NOT_FOUND"
    });
  }

  return post;
}

export async function getReportsForUser(
  currentUserId,
  {
    targetType,
    hideForReporter
  } = {}
) {
  assertObjectId(currentUserId, "userId");

  const filters = {
    reporterUserId: currentUserId
  };

  if (targetType) {
    filters.targetType = validateReportTargetType(targetType);
  }

  if (typeof hideForReporter === "boolean") {
    filters.hideForReporter = hideForReporter;
  }

  const reports = await Report.find(filters).sort({ createdAt: -1 });
  return reports.map((report) => serializeReport(report));
}

export async function submitReport({
  currentUserId,
  targetType,
  targetId,
  reason,
  note = "",
  hideForReporter = false
}) {
  assertObjectId(currentUserId, "userId");

  const safeTargetType = validateReportTargetType(targetType);
  const safeReason = validateReportReason(reason);
  const safeNote = validateReportNote(note, safeReason);
  const safeHideForReporter = hideForReporter === true;

  await requireActiveReportTarget(safeTargetType, targetId);

  const existingReport = await Report.findOne({
    reporterUserId: currentUserId,
    targetType: safeTargetType,
    targetId
  });

  if (existingReport) {
    if (safeHideForReporter && existingReport.hideForReporter !== true) {
      existingReport.hideForReporter = true;
      await existingReport.save();

      return {
        report: serializeReport(existingReport),
        status: "updated"
      };
    }

    throw new AppError("You already reported this.", {
      statusCode: 409,
      code: "REPORT_ALREADY_EXISTS"
    });
  }

  const report = await Report.create({
    reporterUserId: currentUserId,
    targetType: safeTargetType,
    targetId,
    reason: safeReason,
    note: safeNote,
    hideForReporter: safeHideForReporter
  });

  return {
    report: serializeReport(report),
    status: "created"
  };
}
