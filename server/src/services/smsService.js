import { env } from "../config/env.js";
import { AppError } from "../utils/appError.js";
import { validateRequiredPhoneNumber } from "../utils/validators.js";

function formatClickatellPhoneNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length === 10 && digits.startsWith("0")) {
    return `27${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith("27")) {
    return digits;
  }

  if (digits.length === 12 && digits.startsWith("270")) {
    return `27${digits.slice(3)}`;
  }

  throw new AppError(
    'SMS "to" number must use South African format like 0831234567 or 27831234567.',
    {
      statusCode: 400,
      code: "SMS_PHONE_NUMBER_INVALID",
      field: "to"
    }
  );
}

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
  const providerPhoneNumber = formatClickatellPhoneNumber(safePhoneNumber);
  const safeContent = validateMessageContent(content);
  const url = buildSmsUrl({
    to: providerPhoneNumber,
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
    to: providerPhoneNumber,
    content: safeContent,
    response: payload
  };
}
