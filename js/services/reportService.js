import { storage } from "../storage/storage.js";
import { STORAGE_KEYS } from "../config/storageKeys.js";
import { MAX_REPORT_NOTE_LENGTH } from "../utils/validators.js";

export const REPORT_REASONS = [
  "Spam",
  "Harassment or bullying",
  "Hate speech",
  "False information",
  "Violence or threats",
  "Sexual content",
  "Scam or fraud",
  "Other"
];

function makeError(code, field, message) {
  const error = new Error(message);
  error.code = code;
  error.field = field;
  return error;
}

function normalizeReportRecord(report = {}) {
  return {
    id: typeof report.id === "string" && report.id ? report.id : crypto.randomUUID(),
    reporterUserId: typeof report.reporterUserId === "string" ? report.reporterUserId : "",
    targetType: report.targetType === "comment" ? "comment" : "post",
    targetId: typeof report.targetId === "string" ? report.targetId : "",
    reason: typeof report.reason === "string" ? report.reason : "",
    note: typeof report.note === "string" ? report.note.trim() : "",
    hideForReporter: report.hideForReporter === true,
    createdAt:
      typeof report.createdAt === "string" && report.createdAt
        ? report.createdAt
        : new Date().toISOString()
  };
}

function validateReason(reason) {
  const safeReason = typeof reason === "string" ? reason.trim() : "";

  if (!REPORT_REASONS.includes(safeReason)) {
    throw makeError("REPORT_REASON_INVALID", "reason", "Choose a valid report reason.");
  }

  return safeReason;
}

function validateReportNote(note, reason) {
  const safeNote = typeof note === "string" ? note.trim() : "";

  if (reason !== "Other") {
    return "";
  }

  if (!safeNote) {
    throw makeError("REPORT_NOTE_REQUIRED", "note", "Tell us what you are reporting.");
  }

  if (safeNote.length > MAX_REPORT_NOTE_LENGTH) {
    throw makeError(
      "REPORT_NOTE_TOO_LONG",
      "note",
      `Report note must be ${MAX_REPORT_NOTE_LENGTH} characters or fewer.`
    );
  }

  return safeNote;
}

export function getReports() {
  const reports = storage.get(STORAGE_KEYS.REPORTS, []);
  return Array.isArray(reports) ? reports.map(normalizeReportRecord) : [];
}

export function saveReports(reports) {
  storage.set(STORAGE_KEYS.REPORTS, reports);
}

export function getHiddenTargetIdsForUser({ userId, targetType }) {
  const safeUserId = typeof userId === "string" ? userId.trim() : "";
  const safeTargetType = targetType === "comment" ? "comment" : "post";

  if (!safeUserId) {
    return new Set();
  }

  return new Set(
    getReports()
      .filter(
        (report) =>
          report.reporterUserId === safeUserId &&
          report.targetType === safeTargetType &&
          report.hideForReporter === true
      )
      .map((report) => report.targetId)
  );
}

export function createReport({
  reporterUserId,
  targetType,
  targetId,
  reason,
  note = "",
  hideForReporter = false
}) {
  const safeTargetType = targetType === "comment" ? "comment" : "post";
  const safeTargetId = typeof targetId === "string" ? targetId.trim() : "";
  const safeReporterUserId =
    typeof reporterUserId === "string" ? reporterUserId.trim() : "";
  const safeReason = validateReason(reason);
  const safeNote = validateReportNote(note, safeReason);
  const safeHideForReporter = hideForReporter === true;

  if (!safeReporterUserId) {
    throw makeError("REPORT_USER_REQUIRED", null, "You must be signed in to report.");
  }

  if (!safeTargetId) {
    throw makeError("REPORT_TARGET_REQUIRED", null, "Could not report this item.");
  }

  const reports = getReports();
  const duplicate = reports.find(
    (report) =>
      report.reporterUserId === safeReporterUserId &&
      report.targetType === safeTargetType &&
      report.targetId === safeTargetId
  );

  if (duplicate) {
    if (safeHideForReporter && duplicate.hideForReporter !== true) {
      const nextReports = reports.map((report) =>
        report.id === duplicate.id
          ? {
              ...report,
              hideForReporter: true
            }
          : report
      );
      saveReports(nextReports);

      return {
        report: nextReports.find((report) => report.id === duplicate.id) || duplicate,
        status: "updated"
      };
    }

    throw makeError("REPORT_ALREADY_EXISTS", null, "You already reported this.");
  }

  const nextReport = normalizeReportRecord({
    id: crypto.randomUUID(),
    reporterUserId: safeReporterUserId,
    targetType: safeTargetType,
    targetId: safeTargetId,
    reason: safeReason,
    note: safeNote,
    hideForReporter: safeHideForReporter,
    createdAt: new Date().toISOString()
  });

  reports.push(nextReport);
  saveReports(reports);

  return {
    report: nextReport,
    status: "created"
  };
}
