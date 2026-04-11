import { getReportsForUser, submitReport } from "../services/reportService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function parseBoolean(value) {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export const getReportsHandler = asyncHandler(async (req, res) => {
  const reports = await getReportsForUser(req.user._id, {
    targetType: req.query.targetType,
    hideForReporter: parseBoolean(req.query.hideForReporter)
  });

  res.status(200).json({ reports });
});

export const submitReportHandler = asyncHandler(async (req, res) => {
  const result = await submitReport({
    currentUserId: req.user._id,
    targetType: req.body.targetType,
    targetId: req.body.targetId,
    reason: req.body.reason,
    note: req.body.note,
    hideForReporter: req.body.hideForReporter
  });

  res.status(result.status === "created" ? 201 : 200).json({
    message: result.status === "created" ? "Report submitted." : "Report updated.",
    ...result
  });
});
