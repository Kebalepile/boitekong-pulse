import { env } from "../config/env.js";
import { AppError } from "../utils/appError.js";
import { validateRequiredPhoneNumber } from "../utils/validators.js";

function validateMessageContent(content) {
  const safeContent = typeof content === "string" ? content.trim() : "";

  if (!safeContent) {
    throw new AppError("SMS content is required.", {
      statusCode: 400,
      code: "SMS_CONTENT_REQUIRED",
      field: "content"
    });
  }

  return safeContent;
}

function buildSmsUrl({ to, content }) {
  const url = new URL(env.smsBaseUrl);
  url.searchParams.set("apiKey", env.smsApiKey);
  url.searchParams.set("to", to);
  url.searchParams.set("content", content);
  return url;
}

function isJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json");
}

export async function sendSms({ to, content }) {
  if (!env.smsApiKey) {
    throw new AppError("SMS provider is not configured.", {
      statusCode: 500,
      code: "SMS_NOT_CONFIGURED"
    });
  }

  const safePhoneNumber = validateRequiredPhoneNumber(to);
  const safeContent = validateMessageContent(content);
  const url = buildSmsUrl({
    to: safePhoneNumber,
    content: safeContent
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8"
    }
  });

  const payload = isJsonResponse(response)
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new AppError("SMS provider request failed.", {
      statusCode: 502,
      code: "SMS_SEND_FAILED",
      details: {
        provider: "clickatell",
        status: response.status,
        response: payload
      }
    });
  }

  return {
    provider: "clickatell",
    to: safePhoneNumber,
    content: safeContent,
    response: payload
  };
}
