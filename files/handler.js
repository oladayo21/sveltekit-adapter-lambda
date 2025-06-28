import 'SHIMS';
import { env } from 'ENV';
import { manifest, prerendered } from 'MANIFEST';
import { Server } from 'SERVER';
import { resolve, relative, extname, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat, open } from 'node:fs/promises';
import { lstatSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

function d(e){return "rawPath"in e}function p(e){return "requestContext"in e&&"elb"in e.requestContext}function h(e){return d(e)?e.requestContext.domainName||e.headers?.host||"localhost":p(e)?e.headers?.host||e.multiValueHeaders?.host?.[0]||"localhost":e.requestContext.domainName||e.headers?.host||"localhost"}function g(e){return d(e)?e.rawPath:e.path}function b(e){return d(e)?e.requestContext.http.method:e.httpMethod}function y(e){return d(e)?e.rawQueryString||"":e.multiValueQueryStringParameters?Object.entries(e.multiValueQueryStringParameters).filter(([,t])=>t&&t.length>0).flatMap(([t,n])=>n.map(r=>`${encodeURIComponent(t)}=${encodeURIComponent(r)}`)).join("&"):e.queryStringParameters?Object.entries(e.queryStringParameters).filter(([,t])=>t!=null).map(([t,n])=>`${encodeURIComponent(t)}=${encodeURIComponent(n)}`).join("&"):""}function E(e){let t=new Headers;return d(e)?(e.headers&&Object.entries(e.headers).forEach(([n,r])=>{r!=null&&t.set(n,r);}),e.cookies?.length&&t.set("cookie",e.cookies.join("; "))):(e.headers&&Object.entries(e.headers).forEach(([n,r])=>{r!=null&&t.set(n,r);}),e.multiValueHeaders&&Object.entries(e.multiValueHeaders).forEach(([n,r])=>{if(r?.length){let o=t.get(n);r.forEach(s=>{(!o||!o.includes(s))&&t.append(n,s);});}})),t}function R(e){return e.body?e.isBase64Encoded?Buffer.from(e.body,"base64"):e.body:null}function u(e){let t=h(e),n=g(e),r=b(e),o=y(e),s=E(e),a=R(e),i=new URL(n,`https://${t}`);return o&&(i.search=o),new Request(i,{method:r,headers:s,body:a})}function x(e,t=[]){let n=e.headers.get("content-type")||"",r=e.headers.get("content-encoding");return r&&/^(gzip|deflate|compress|br)/.test(r)?true:t.length>0?t.some(o=>n.includes(o)||o==="*/*"||o.endsWith("/*")&&n.startsWith(o.slice(0,-2))):!/^(text\/(plain|html|css|javascript|csv).*|application\/(.*json|.*xml).*|image\/svg\+xml.*)$/.test(n)}function L(e){if(!e.headers.has("set-cookie"))return [];if("getSetCookie"in e.headers&&typeof e.headers.getSetCookie=="function")return e.headers.getSetCookie();let t=[];return e.headers.forEach((n,r)=>{r.toLowerCase()==="set-cookie"&&t.push(n);}),t}function m(e,t=false){if(t){let r={};return e.headers.forEach((o,s)=>{s.toLowerCase()!=="set-cookie"&&(r[s]?r[s].push(o):r[s]=[o]);}),r}let n={};return e.headers.forEach((r,o)=>{o.toLowerCase()!=="set-cookie"&&(n[o]=r);}),n}async function l(e,t={}){let{binaryMediaTypes:n=[],multiValueHeaders:r=false}=t,o=await e.text(),s=x(e,n),a=L(e),i={statusCode:e.status,body:s?Buffer.from(o).toString("base64"):o,isBase64Encoded:s};if(r){let c={...i,multiValueHeaders:m(e,true)};return a.length>0&&(c.multiValueHeaders={...c.multiValueHeaders,"Set-Cookie":a}),c}let f={...i,headers:m(e,false)};return a.length>0&&(f.multiValueHeaders={"Set-Cookie":a}),f}

// src/index.ts
var FileServerError = class extends Error {
  /**
   * Creates a new FileServerError.
   *
   * @param code - Machine-readable error code (e.g., 'FILE_NOT_FOUND', 'INVALID_CONFIG')
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code to return to client
   * @param filePath - File path related to the error, if applicable
   * @param operation - Operation being performed when error occurred
   * @param cause - Underlying error that caused this error
   */
  constructor(code, message, statusCode, filePath, operation, cause) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.filePath = filePath;
    this.operation = operation;
    this.name = "FileServerError";
    if (cause) this.cause = cause;
  }
};
function validateRootDirectory(root) {
  if (!root || typeof root !== "string") {
    throw new FileServerError(
      "INVALID_CONFIG",
      "Root directory must be a non-empty string",
      500,
      String(root),
      "config_validation"
    );
  }
  try {
    const rootStats = statSync(root);
    if (!rootStats.isDirectory()) {
      throw new FileServerError(
        "INVALID_ROOT",
        `Root path is not a directory: ${root}`,
        500,
        root,
        "config_validation"
      );
    }
  } catch (cause) {
    if (cause instanceof FileServerError) {
      throw cause;
    }
    throw new FileServerError(
      "ROOT_NOT_ACCESSIBLE",
      `Root directory not accessible: ${root}`,
      500,
      root,
      "config_validation",
      cause instanceof Error ? cause : new Error(String(cause))
    );
  }
}
function validateCacheControl(cacheControl) {
  if (!cacheControl || typeof cacheControl === "string") return;
  for (const [pattern, value] of Object.entries(cacheControl)) {
    try {
      new RegExp(pattern);
    } catch (cause) {
      throw new FileServerError(
        "INVALID_CACHE_PATTERN",
        `Invalid regex pattern in cache control: ${pattern}`,
        500,
        void 0,
        "config_validation",
        cause instanceof Error ? cause : new Error(String(cause))
      );
    }
    if (typeof value !== "string") {
      throw new FileServerError(
        "INVALID_CACHE_VALUE",
        `Cache control value must be a string: ${pattern}`,
        500,
        void 0,
        "config_validation"
      );
    }
  }
}
function validateCompression(compression) {
  if (!Array.isArray(compression)) return;
  const validEncodings = ["br", "gzip", "deflate"];
  for (const encoding of compression) {
    if (!validEncodings.includes(encoding)) {
      throw new FileServerError(
        "INVALID_COMPRESSION",
        `Unsupported compression algorithm: ${encoding}. Supported: ${validEncodings.join(", ")}`,
        500,
        void 0,
        "config_validation"
      );
    }
  }
}
function validateIndexFiles(index) {
  if (!index) return;
  if (!Array.isArray(index)) {
    throw new FileServerError(
      "INVALID_INDEX",
      "Index option must be an array of strings",
      500,
      void 0,
      "config_validation"
    );
  }
  for (const indexFile of index) {
    if (typeof indexFile !== "string" || indexFile.trim() === "") {
      throw new FileServerError(
        "INVALID_INDEX_FILE",
        "Index file names must be non-empty strings",
        500,
        void 0,
        "config_validation"
      );
    }
  }
}
function validateFileServerOptions(options) {
  validateRootDirectory(options.root);
  validateCacheControl(options.cacheControl);
  validateCompression(options.compression);
  validateIndexFiles(options.index);
}

// src/http-utils.ts
function sanitizeHeader(value) {
  if (value === null || value === void 0) return null;
  if (value === "") return "";
  const sanitized = value.replaceAll("\0", "").replaceAll("\r", "").replaceAll("\n", "");
  const maxHeaderLength = 8192;
  if (sanitized.length > maxHeaderLength) {
    return sanitized.substring(0, maxHeaderLength);
  }
  return sanitized;
}
function parseRange(rangeHeader, fileSize) {
  if (fileSize === 0) {
    return null;
  }
  const ranges = rangeHeader.replace(/bytes=/, "").split(",");
  if (ranges.length > 1) {
    throw new FileServerError(
      "MULTIPLE_RANGES_NOT_SUPPORTED",
      "Multiple ranges are not supported. Please request one range at a time.",
      416,
      void 0,
      "range_parsing"
    );
  }
  const range = ranges[0]?.trim();
  if (!range) return null;
  const dashCount = (range.match(/-/g) || []).length;
  if (dashCount !== 1) {
    return null;
  }
  const [startStr, endStr] = range.split("-");
  let start;
  let end;
  if (startStr === "" && endStr !== "") {
    const suffixLength = parseInt(endStr, 10);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else if (startStr !== "" && endStr === "") {
    start = parseInt(startStr, 10);
    if (Number.isNaN(start) || start < 0) {
      return null;
    }
    end = fileSize - 1;
  } else if (startStr !== "" && endStr !== "") {
    start = parseInt(startStr, 10);
    end = parseInt(endStr, 10);
    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < 0) {
      return null;
    }
  } else {
    return null;
  }
  if (start >= fileSize || start > end) {
    return null;
  }
  end = Math.min(end, fileSize - 1);
  return {
    start,
    end,
    contentLength: end - start + 1
  };
}
function handleConditionalRequests(request, fileStats, etagValue, headers = {}) {
  const ifNoneMatch = sanitizeHeader(request.headers.get("if-none-match"));
  const ifModifiedSince = sanitizeHeader(request.headers.get("if-modified-since"));
  if (ifNoneMatch && etagValue) {
    const clientETags = ifNoneMatch.split(",").map((tag) => tag.trim());
    if (clientETags.includes(etagValue) || clientETags.includes("*")) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etagValue,
          "Last-Modified": fileStats.mtime.toUTCString(),
          ...headers
        }
      });
    }
  }
  if (ifModifiedSince && !ifNoneMatch) {
    const clientDate = new Date(ifModifiedSince);
    const fileDate = new Date(fileStats.mtime);
    fileDate.setMilliseconds(0);
    if (fileDate <= clientDate) {
      return new Response(null, {
        status: 304,
        headers: {
          "Last-Modified": fileStats.mtime.toUTCString(),
          ...etagValue && { ETag: etagValue },
          ...headers
        }
      });
    }
  }
  return null;
}
function handleRangeRequest(request, fileStats, etagValue, headers = {}) {
  const rangeHeader = sanitizeHeader(request.headers.get("range"));
  let rangeRequest = null;
  if (!rangeHeader) {
    return { rangeRequest };
  }
  try {
    rangeRequest = parseRange(rangeHeader, fileStats.size);
  } catch (error) {
    if (error instanceof FileServerError && error.code === "MULTIPLE_RANGES_NOT_SUPPORTED") {
      return {
        rangeRequest: null,
        rangeResponse: new Response(error.message, { status: error.statusCode })
      };
    }
    throw error;
  }
  if (!rangeRequest) {
    return {
      rangeRequest: null,
      rangeResponse: new Response("Range Not Satisfiable", {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileStats.size}`,
          ...etagValue && { ETag: etagValue },
          ...headers
        }
      })
    };
  }
  return { rangeRequest };
}

// src/compression.ts
async function findPrecompressedFile(filePath, encoding) {
  const extensions = {
    br: ".br",
    gzip: ".gz",
    deflate: ".gz"
    // deflate uses same .gz extension as gzip
  };
  const ext = extensions[encoding];
  if (!ext) return null;
  const compressedPath = `${filePath}${ext}`;
  try {
    await stat(compressedPath);
    return compressedPath;
  } catch {
    return null;
  }
}
async function handleCompression(filePath, request, supportedEncodings, precompressed) {
  if (supportedEncodings.length === 0) {
    return { finalFilePath: filePath };
  }
  const acceptEncoding = sanitizeHeader(request.headers.get("accept-encoding"));
  if (!acceptEncoding || !precompressed) {
    return { finalFilePath: filePath };
  }
  const preferredEncodings = parseAcceptEncodingMultiple(acceptEncoding, supportedEncodings);
  for (const encoding of preferredEncodings) {
    const precompressedPath = await findPrecompressedFile(filePath, encoding);
    if (precompressedPath) {
      try {
        const fileStats = await stat(precompressedPath);
        return {
          finalFilePath: precompressedPath,
          contentEncoding: encoding,
          fileStats
        };
      } catch {
      }
    }
  }
  return { finalFilePath: filePath };
}
function parseAcceptEncodingMultiple(acceptEncoding, supportedEncodings) {
  if (!acceptEncoding) return [];
  const encodings = acceptEncoding.split(",").map((enc) => {
    const [encoding, q] = enc.trim().split(";");
    let quality = 1;
    if (q) {
      const qValue = parseFloat(q.replace(/q\s*=\s*/, ""));
      if (!Number.isNaN(qValue)) {
        quality = qValue;
      }
    }
    return { encoding: encoding.trim(), quality };
  }).filter((enc) => enc.quality > 0).sort((a, b) => b.quality - a.quality);
  const result = [];
  for (const { encoding } of encodings) {
    if (supportedEncodings.includes(encoding) && !result.includes(encoding)) {
      result.push(encoding);
    }
  }
  return result;
}
var MIME_TYPES = {
  // Text
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".txt": "text/plain",
  ".xml": "text/xml",
  ".json": "application/json",
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  // Fonts
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  // Documents
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  // Media
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg"
};
function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}
function generateETag(stats, filePath, weak = false) {
  const hash = createHash("sha256");
  hash.update(`${stats.size}-${stats.mtime.getTime()}-${filePath}`);
  const etag = hash.digest("hex").substring(0, 16);
  return weak ? `W/"${etag}"` : `"${etag}"`;
}
function getCacheControl(filePath, cacheControl) {
  if (!cacheControl) return void 0;
  if (typeof cacheControl === "string") {
    return cacheControl;
  }
  for (const [pattern, value] of Object.entries(cacheControl)) {
    if (filePath.match(new RegExp(pattern))) {
      return value;
    }
  }
  return void 0;
}
function resolveFilePath(pathname, root) {
  try {
    const decodedPath = decodeURIComponent(pathname);
    const relativePath = decodedPath.replace(/^\/+/, "");
    const absoluteRoot = resolve(root);
    const requestedPath = resolve(absoluteRoot, relativePath);
    const relativeToRoot = relative(absoluteRoot, requestedPath);
    if (relativeToRoot.startsWith("..") || resolve(relativeToRoot) === relativeToRoot) {
      return { filePath: "", isValid: false };
    }
    return { filePath: requestedPath, isValid: true };
  } catch {
    return { filePath: "", isValid: false };
  }
}
function checkForSymlink(filePath) {
  try {
    const stats = lstatSync(filePath);
    if (stats.isSymbolicLink()) {
      return new FileServerError("SYMLINK_DENIED", "Not Found", 404, filePath, "symlink_check");
    }
    return null;
  } catch (cause) {
    return new FileServerError(
      "SYMLINK_CHECK_ERROR",
      "Unable to verify file security",
      500,
      filePath,
      "symlink_check",
      cause instanceof Error ? cause : new Error(String(cause))
    );
  }
}
function shouldServeDotfile(filePath, dotfiles) {
  const pathParts = filePath.split("/").filter((part) => part !== "");
  const isDotfile = pathParts.some((part) => part.startsWith("."));
  if (!isDotfile) return true;
  switch (dotfiles) {
    case "allow":
      return true;
    case "deny":
      return false;
    case "ignore":
      return false;
    default:
      return false;
  }
}
async function handleDirectoryRequest(filePath, indexFiles) {
  for (const indexFile of indexFiles) {
    const indexPath = resolve(filePath, indexFile);
    try {
      const indexStats = await stat(indexPath);
      if (indexStats.isFile()) {
        return { indexPath, indexStats };
      }
    } catch {
    }
  }
  return {};
}
async function createStreamingResponse(filePath, rangeRequest, fileStats, isHeadRequest, status, headers) {
  const fileHandle = await open(filePath, "r");
  const chunkSize = 64 * 1024;
  const startPos = rangeRequest ? rangeRequest.start : 0;
  const endPos = rangeRequest ? rangeRequest.end : fileStats.size - 1;
  const totalToRead = endPos - startPos + 1;
  const webStream = new ReadableStream({
    async start(controller) {
      try {
        let position = startPos;
        let bytesRemaining = totalToRead;
        const buffer = new Uint8Array(chunkSize);
        while (bytesRemaining > 0) {
          const bytesToRead = Math.min(chunkSize, bytesRemaining);
          const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, position);
          if (bytesRead === 0) break;
          controller.enqueue(buffer.slice(0, bytesRead));
          position += bytesRead;
          bytesRemaining -= bytesRead;
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        await fileHandle.close();
      }
    },
    async cancel() {
      await fileHandle.close();
    }
  });
  return new Response(isHeadRequest ? null : webStream, { status, headers });
}
async function createBufferedResponse(filePath, rangeRequest, isHeadRequest, status, headers) {
  const { readFile } = await import('node:fs/promises');
  if (rangeRequest) {
    const fileHandle = await open(filePath, "r");
    const buffer = new Uint8Array(rangeRequest.contentLength);
    await fileHandle.read(buffer, 0, rangeRequest.contentLength, rangeRequest.start);
    await fileHandle.close();
    return new Response(isHeadRequest ? null : buffer, { status, headers });
  }
  const fileContent = await readFile(filePath);
  return new Response(isHeadRequest ? null : fileContent, { status, headers });
}

// src/index.ts
var DEFAULT_OPTIONS = {
  dotfiles: "ignore",
  headers: {},
  index: ["index.html"],
  streaming: true,
  etag: true,
  compression: true,
  precompressed: true
};
function createFileServer(options) {
  validateFileServerOptions(options);
  const config = { ...DEFAULT_OPTIONS, ...options };
  const supportedEncodings = Array.isArray(config.compression) ? config.compression : config.compression ? ["br", "gzip", "deflate"] : [];
  return async (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" }
      });
    }
    const isHeadRequest = request.method === "HEAD";
    try {
      const url = new URL(request.url);
      let { filePath, isValid } = resolveFilePath(url.pathname, config.root);
      if (!isValid) {
        return new Response("Forbidden", { status: 403 });
      }
      if (!shouldServeDotfile(filePath, config.dotfiles)) {
        return new Response("Not Found", { status: 404 });
      }
      let fileStats;
      try {
        fileStats = await stat(filePath);
      } catch (cause) {
        const error = new FileServerError(
          "FILE_NOT_FOUND",
          "File not found or inaccessible",
          404,
          filePath,
          "file_stat",
          cause instanceof Error ? cause : new Error(String(cause))
        );
        return new Response(error.message, { status: error.statusCode });
      }
      const symlinkError = checkForSymlink(filePath);
      if (symlinkError) {
        return new Response(symlinkError.message, { status: symlinkError.statusCode });
      }
      if (fileStats.isDirectory()) {
        const { indexPath, indexStats } = await handleDirectoryRequest(filePath, config.index);
        if (!indexPath || !indexStats) {
          return new Response("Not Found", { status: 404 });
        }
        filePath = indexPath;
        fileStats = indexStats;
      }
      const compressionResult = await handleCompression(
        filePath,
        request,
        supportedEncodings,
        config.precompressed
      );
      const finalFilePath = compressionResult.finalFilePath;
      const contentEncoding = compressionResult.contentEncoding;
      if (compressionResult.fileStats) {
        fileStats = compressionResult.fileStats;
      }
      let etagValue;
      if (config.etag) {
        const isWeak = config.etag === "weak";
        etagValue = generateETag(fileStats, filePath, isWeak);
      }
      const rangeResult = handleRangeRequest(request, fileStats, etagValue, config.headers);
      if (rangeResult.rangeResponse) {
        return rangeResult.rangeResponse;
      }
      const rangeRequest = rangeResult.rangeRequest;
      const conditionalResponse = handleConditionalRequests(
        request,
        fileStats,
        etagValue,
        config.headers
      );
      if (conditionalResponse) {
        return conditionalResponse;
      }
      const isRangeRequest = !!rangeRequest;
      const status = isRangeRequest ? 206 : 200;
      const contentLength = rangeRequest ? rangeRequest.contentLength : fileStats.size;
      const mimeType = getMimeType(filePath);
      const cacheControlValue = getCacheControl(filePath, config.cacheControl);
      const responseHeaders = new Headers({
        "Content-Type": mimeType,
        "Content-Length": String(contentLength),
        "Last-Modified": fileStats.mtime.toUTCString(),
        "Accept-Ranges": "bytes",
        ...etagValue && { ETag: etagValue },
        ...contentEncoding && { "Content-Encoding": contentEncoding },
        ...cacheControlValue && { "Cache-Control": cacheControlValue },
        ...rangeRequest && {
          "Content-Range": `bytes ${rangeRequest.start}-${rangeRequest.end}/${fileStats.size}`
        },
        ...config.headers
      });
      if (isHeadRequest) {
        return new Response(null, { status, headers: responseHeaders });
      }
      try {
        if (config.streaming) {
          return await createStreamingResponse(
            finalFilePath,
            rangeRequest,
            fileStats,
            isHeadRequest,
            status,
            responseHeaders
          );
        } else {
          return await createBufferedResponse(
            finalFilePath,
            rangeRequest,
            isHeadRequest,
            status,
            responseHeaders
          );
        }
      } catch (cause) {
        const errorCode = config.streaming ? "STREAM_READ_ERROR" : "BUFFER_READ_ERROR";
        const errorMessage = config.streaming ? "Failed to open file for streaming" : "Failed to read file into memory";
        const operation = config.streaming ? "file_stream" : "file_buffer";
        const error = new FileServerError(
          errorCode,
          errorMessage,
          500,
          finalFilePath,
          operation,
          cause instanceof Error ? cause : new Error(String(cause))
        );
        return new Response(error.message, { status: error.statusCode });
      }
    } catch (cause) {
      const error = new FileServerError(
        "REQUEST_PROCESSING_ERROR",
        "Unexpected error processing request",
        500,
        void 0,
        "request_processing",
        cause instanceof Error ? cause : new Error(String(cause))
      );
      return new Response(error.message, { status: error.statusCode });
    }
  };
}

var isProduction = process.env.NODE_ENV === 'production';
var prefix = 'Invariant failed';
function invariant(condition, message) {
    if (condition) {
        return;
    }
    if (isProduction) {
        throw new Error(prefix);
    }
    var provided = typeof message === 'function' ? message() : message;
    var value = provided ? "".concat(prefix, ": ").concat(provided) : prefix;
    throw new Error(value);
}

/* global ENV_PREFIX */

const server = new Server(manifest);

Number.parseInt(env('BODY_SIZE_LIMIT', 'BODY_SIZE_LIMIT'));
const binaryMediaTypes = BINARY_MEDIA_TYPES;
const serveStatic = SERVE_STATIC;

// Get the directory of this handler file
const dir = dirname(fileURLToPath(import.meta.url));

// Initialize server with timeout protection
const SERVER_INIT_TIMEOUT = 10000; // 10 seconds
try {
  await Promise.race([
    server.init({
      env: process.env,
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Server initialization timeout')), SERVER_INIT_TIMEOUT)
    ),
  ]);
} catch (error) {
  console.error('Server initialization failed:', error);
  // Continue execution - the handler will return an error if needed
}

/**
 * Extract client IP address from Lambda event
 * @param {any} event - Lambda event
 * @returns {string}
 */
function extractClientIp(event) {
  // Try multiple sources for client IP
  const forwardedFor = event.headers?.['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // API Gateway v2
  if (event.requestContext?.http?.sourceIp) {
    return event.requestContext.http.sourceIp;
  }

  // API Gateway v1
  if (event.requestContext?.identity?.sourceIp) {
    return event.requestContext.identity.sourceIp;
  }

  // ALB
  if (event.requestContext?.elb) {
    return event.headers?.['x-forwarded-for'] || '127.0.0.1';
  }

  return '127.0.0.1';
}

/**
 * Determine if event is from ALB (needs multiValueHeaders)
 * @param {any} event
 * @returns {boolean}
 */
function isALBEvent(event) {
  return event.requestContext && 'elb' in event.requestContext;
}

/**
 * Create file server only if directory exists (like SvelteKit node adapter)
 * @param {string} path - Directory path
 * @param {any} options - File server options
 * @returns {Function|null} - File server function or null if directory doesn't exist
 */
function serve(path, options = {}) {
  try {
    statSync(path);
    return createFileServer({ root: path, ...options });
  } catch {
    return null;
  }
}

// Create file server instances for different asset types
let clientFileServer = null;
let prerenderedFileServer = null;
let staticFileServer = null;

if (serveStatic) {
  // Client assets - SvelteKit's built JS/CSS with aggressive caching for immutable files
  clientFileServer = serve(join(dir, 'client'), {
    compression: true,
    cacheControl: {
      '/_app/immutable/.*': 'public,max-age=31536000,immutable',
      '.*': 'public,max-age=3600',
    },
    etag: true,
  });

  // Static assets
  staticFileServer = serve(join(dir, 'static'), {
    compression: true,
    cacheControl: 'public,max-age=3600',
    etag: true,
  });

  // Prerendered pages - different caching strategy for HTML vs other assets
  prerenderedFileServer = serve(join(dir, 'prerendered'), {
    compression: true,
    cacheControl: {
      '\\.html$': 'no-cache',
      '.*': 'public,max-age=3600',
    },
    etag: true,
  });
}

/**
 * AWS Lambda handler with hybrid architecture
 * @param {any} event - Lambda Function URL, API Gateway, or ALB event
 * @param {any} context
 * @returns {Promise<any>}
 */
/**
 * Check if response size exceeds Lambda limits
 * @param {Response} response - Web Response object
 * @returns {Promise<boolean>}
 */
async function isResponseTooLarge(response) {
  const LAMBDA_RESPONSE_LIMIT = 6 * 1024 * 1024; // 6MB in bytes

  // Clone response to avoid consuming the original
  const clonedResponse = response.clone();
  const body = await clonedResponse.text();
  const bodySize = new TextEncoder().encode(body).length;

  // Account for headers and metadata overhead (rough estimate)
  const headersSize = JSON.stringify(Object.fromEntries(response.headers)).length;
  const totalSize = bodySize + headersSize + 1024; // 1KB buffer for metadata

  return totalSize > LAMBDA_RESPONSE_LIMIT;
}

/**
 * Create a 413 response for oversized content
 * @returns {Response}
 */
function createOversizedResponse() {
  return new Response(
    JSON.stringify({
      error: 'Payload Too Large',
      message: 'Response exceeds Lambda size limits',
    }),
    {
      status: 413,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-cache',
      },
    }
  );
}

/**
 * Validate Lambda event structure using tiny-invariant
 * @param {any} event - Lambda event
 */
function validateLambdaEvent(event) {
  invariant(event && typeof event === 'object', 'Lambda event must be a valid object');
  invariant(
    event.headers && typeof event.headers === 'object',
    'Lambda event must have headers object'
  );
  invariant(
    event.requestContext && typeof event.requestContext === 'object',
    'Lambda event must have requestContext object'
  );

  const hasMethod = event.httpMethod || event.requestContext?.http?.method;
  invariant(hasMethod, 'Lambda event must have HTTP method');

  const hasPath = event.path || event.rawPath;
  invariant(hasPath, 'Lambda event must have path');
}

/**
 * @param {any} event
 * @param {any} context
 */
const handler = async (event, context) => {
  try {
    // Validate Lambda event structure
    validateLambdaEvent(event);

    const webRequest = u(event);
    const pathname = new URL(webRequest.url).pathname;

    // Handle client assets first (JS, CSS, images, etc.)
    if (serveStatic && clientFileServer) {
      const clientResponse = await clientFileServer(webRequest);
      if (clientResponse.status !== 404) {
        // Check response size before returning
        if (await isResponseTooLarge(clientResponse)) {
          return await l(createOversizedResponse(), {
            binaryMediaTypes,
            multiValueHeaders: isALBEvent(event),
          });
        }
        return await l(clientResponse, {
          binaryMediaTypes,
          multiValueHeaders: isALBEvent(event),
        });
      }
    }

    // Handle static assets
    if (serveStatic && staticFileServer) {
      const staticResponse = await staticFileServer(webRequest);
      if (staticResponse.status !== 404) {
        // Check response size before returning
        if (await isResponseTooLarge(staticResponse)) {
          return await l(createOversizedResponse(), {
            binaryMediaTypes,
            multiValueHeaders: isALBEvent(event),
          });
        }
        return await l(staticResponse, {
          binaryMediaTypes,
          multiValueHeaders: isALBEvent(event),
        });
      }
    }

    // Handle prerendered pages
    if (serveStatic && prerendered.has(pathname) && prerenderedFileServer) {
      const prerenderedResponse = await prerenderedFileServer(webRequest);
      if (prerenderedResponse.status !== 404) {
        // Check response size before returning
        if (await isResponseTooLarge(prerenderedResponse)) {
          return await l(createOversizedResponse(), {
            binaryMediaTypes,
            multiValueHeaders: isALBEvent(event),
          });
        }
        return await l(prerenderedResponse, {
          binaryMediaTypes,
          multiValueHeaders: isALBEvent(event),
        });
      }
    }

    const response = await server.respond(webRequest, {
      platform: {
        event,
        context,
        req: webRequest,
      },
      getClientAddress: () => extractClientIp(event),
    });

    // Check response size before returning
    if (await isResponseTooLarge(response)) {
      return await l(createOversizedResponse(), {
        binaryMediaTypes,
        multiValueHeaders: isALBEvent(event),
      });
    }

    return await l(response, {
      binaryMediaTypes,
      multiValueHeaders: isALBEvent(event),
    });
  } catch (error) {
    // Log error for debugging (in production, ensure logs don't contain sensitive data)
    console.error('Lambda handler error:', error);

    // Check if this is a validation error (from tiny-invariant)
    const isValidationError = error instanceof Error && error.message.includes('Lambda event');

    if (isValidationError) {
      return {
        statusCode: 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: 'Bad Request',
          message: error.message,
        }),
        isBase64Encoded: false,
      };
    }

    // Sanitize error response for security
    const isDevelopment = env('NODE_ENV') === 'development';
    let errorMessage = 'An unexpected error occurred';

    if (isDevelopment && error instanceof Error) {
      errorMessage = error.message;
    }

    // Ensure we don't leak sensitive information in error responses
    const sanitizedError = {
      error: 'Internal Server Error',
      message: errorMessage,
      ...(isDevelopment && { timestamp: new Date().toISOString() }),
    };

    return {
      statusCode: 500,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-cache, no-store, must-revalidate',
      },
      body: JSON.stringify(sanitizedError),
      isBase64Encoded: false,
    };
  }
};

export { handler };
