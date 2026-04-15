import http from "node:http";
import path from "node:path";
import { createReadStream, promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "../../..");
const host = process.env.WEB_HOST || "localhost";
const port = Number(process.env.WEB_PORT || 4173);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function resolveFilePath(requestUrl = "/") {
  const requestPath = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
  const normalizedPath =
    requestPath === "/" ? "index.html" : path.normalize(requestPath).replace(/^([/\\])+/, "");
  const absolutePath = path.resolve(projectRoot, normalizedPath);

  if (!absolutePath.startsWith(projectRoot)) {
    return null;
  }

  return absolutePath;
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function streamFile(response, filePath, statusCode = 200) {
  response.writeHead(statusCode, {
    "Content-Type": getContentType(filePath),
    "Cache-Control": "no-cache"
  });

  createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method Not Allowed");
    return;
  }

  const resolvedFilePath = resolveFilePath(request.url);

  if (!resolvedFilePath) {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Bad Request");
    return;
  }

  let filePath = resolvedFilePath;

  if (!(await fileExists(filePath)) && !path.extname(filePath)) {
    filePath = path.join(projectRoot, "index.html");
  }

  if (!(await fileExists(filePath))) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  if (request.method === "HEAD") {
    response.writeHead(200, {
      "Content-Type": getContentType(filePath),
      "Cache-Control": "no-cache"
    });
    response.end();
    return;
  }

  streamFile(response, filePath);
});

server.listen(port, host, () => {
  console.log(`Boitekong Pulse web app running at http://${host}:${port}`);
});
