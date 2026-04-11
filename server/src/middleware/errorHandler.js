import mongoose from "mongoose";
import { env } from "../config/env.js";
import { AppError } from "../utils/appError.js";

function toErrorPayload(error) {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          field: error.field,
          details: error.details
        }
      }
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const firstIssue = Object.values(error.errors)[0];

    return {
      statusCode: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue?.message || "Validation failed.",
          field: firstIssue?.path || null
        }
      }
    };
  }

  if (error?.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0] || null;
    const normalizedField = duplicateField === "usernameLower" ? "username" : duplicateField;

    return {
      statusCode: 409,
      body: {
        error: {
          code: "DUPLICATE_KEY",
          message:
            normalizedField === "phoneNumber"
              ? "Phone number already exists."
              : "Username already exists.",
          field: normalizedField
        }
      }
    };
  }

  if (
    error?.type === "entity.too.large" ||
    error?.status === 413 ||
    error?.statusCode === 413
  ) {
    return {
      statusCode: 413,
      body: {
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message:
            "That upload is too large for the current request. Try a smaller photo or a shorter voice note."
        }
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong on the server."
      }
    }
  };
}

export function notFoundHandler(req, res, next) {
  next(
    new AppError(`Route not found: ${req.method} ${req.originalUrl}`, {
      statusCode: 404,
      code: "ROUTE_NOT_FOUND"
    })
  );
}

export function errorHandler(error, req, res, next) {
  const { statusCode, body } = toErrorPayload(error);

  if (statusCode >= 500) {
    console.error(error);
  }

  if (env.nodeEnv !== "production" && statusCode >= 500) {
    body.error.stack = error?.stack || null;
  }

  res.status(statusCode).json(body);
}
