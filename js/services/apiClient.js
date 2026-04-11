import { STORAGE_KEYS } from "../config/storageKeys.js";
import { storage } from "../storage/storage.js";

function trimTrailingSlash(value = "") {
  return String(value || "").replace(/\/+$/, "");
}

function resolveApiBaseUrl() {
  const configuredBaseUrl =
    typeof window !== "undefined" && typeof window.BOITEKONG_PULSE_API_BASE_URL === "string"
      ? trimTrailingSlash(window.BOITEKONG_PULSE_API_BASE_URL)
      : "";

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  if (typeof window !== "undefined" && window.location) {
    const { hostname, origin, protocol } = window.location;
    const isLocalHost = ["localhost", "127.0.0.1"].includes(hostname);

    if (protocol === "file:") {
      return "http://127.0.0.1:4000/api";
    }

    if (isLocalHost) {
      return "http://127.0.0.1:4000/api";
    }

    return `${trimTrailingSlash(origin)}/api`;
  }

  return "http://127.0.0.1:4000/api";
}

function makeErrorFromResponse(body, fallbackMessage) {
  const error = new Error(body?.error?.message || fallbackMessage);
  error.code = body?.error?.code || "API_REQUEST_FAILED";
  error.field = body?.error?.field || null;
  error.details = body?.error?.details || null;
  return error;
}

export function getAccessToken() {
  return storage.get(STORAGE_KEYS.ACCESS_TOKEN, "");
}

export function setAccessToken(token) {
  if (typeof token === "string" && token.trim()) {
    storage.set(STORAGE_KEYS.ACCESS_TOKEN, token.trim());
    return token.trim();
  }

  storage.remove(STORAGE_KEYS.ACCESS_TOKEN);
  return "";
}

export function clearAccessToken() {
  storage.remove(STORAGE_KEYS.ACCESS_TOKEN);
}

export function getApiBaseUrl() {
  return resolveApiBaseUrl();
}

export async function apiRequest(path, options = {}) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${getApiBaseUrl()}${normalizedPath}`;
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  const method = String(options.method || "GET").toUpperCase();

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let body = options.body;

  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    body = JSON.stringify(body);
  }

  let response;

  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      mode: "cors"
    });
  } catch (error) {
    const networkError = new Error(
      "Could not reach the Boitekong Pulse API. Make sure the backend server is running."
    );
    networkError.code = "API_NETWORK_ERROR";
    networkError.cause = error;
    throw networkError;
  }

  const contentType = response.headers.get("content-type") || "";
  const responseBody = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) {
      clearAccessToken();
    }

    throw makeErrorFromResponse(responseBody, "Request failed.");
  }

  return responseBody ?? {};
}
