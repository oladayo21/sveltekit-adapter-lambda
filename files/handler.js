import 'SHIMS';
import { env } from 'ENV';
import { manifest } from 'MANIFEST';
import { Server } from 'SERVER';
// 🔥 Use our robust converters instead of basic event parsing
import {
  convertLambdaEventToWebRequest,
  convertWebResponseToLambdaEvent,
} from '@foladayo/lambda-adapter-kit';
import { getRequest } from '@sveltejs/kit/node';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

/* global ENV_PREFIX */

const server = new Server(manifest);

const body_size_limit = Number.parseInt(env('BODY_SIZE_LIMIT', 'BODY_SIZE_LIMIT'));
const binaryMediaTypes = BINARY_MEDIA_TYPES;

// Get the directory of this handler file
const __dirname = dirname(fileURLToPath(import.meta.url));

await server.init({
  env: process.env,
});

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
 * Convert Web Request to Node.js request-like object for SvelteKit
 * @param {Request} webRequest - Standard Web Request
 * @param {any} event - Original Lambda event for additional context
 * @returns {object}
 */
function convertWebRequestToNodeRequest(webRequest, event) {
  const url = new URL(webRequest.url);

  return {
    method: webRequest.method,
    url: url.pathname + url.search,
    headers: Object.fromEntries(webRequest.headers.entries()),
    body: webRequest.body,
    // Additional Node.js request properties
    httpVersion: '1.1',
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    connection: {
      remoteAddress: extractClientIp(event),
    },
  };
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
 * Serve static files from the bundled client directory
 * @param {string} path - The requested path
 * @returns {Promise<Response|null>} - Response for static file or null if not found
 */
async function tryServeStaticFile(path) {
  // Handle client assets (JS, CSS, etc.)
  if (path.startsWith('/_app/') || path.startsWith('/favicon.ico')) {
    try {
      const filePath = join(__dirname, 'client', path);
      const content = readFileSync(filePath);
      
      // Determine content type
      const ext = extname(path).toLowerCase();
      const contentType = {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject'
      }[ext] || 'application/octet-stream';
      
      return new Response(content, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': path.includes('/immutable/') 
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600'
        }
      });
    } catch (error) {
      // File not found or error reading
      return null;
    }
  }
  
  return null;
}

/**
 * AWS Lambda handler with hybrid architecture
 * @param {any} event - Lambda Function URL, API Gateway, or ALB event
 * @param {import('aws-lambda').Context} context
 * @returns {Promise<any>}
 */
export const handler = async (event, context) => {
  try {
    // 🔥 Use our superior event conversion (handles all Lambda event types)
    const webRequest = convertLambdaEventToWebRequest(event);
    
    // Try to serve static files first
    const staticFileResponse = await tryServeStaticFile(new URL(webRequest.url).pathname);
    if (staticFileResponse) {
      return await convertWebResponseToLambdaEvent(staticFileResponse, {
        binaryMediaTypes,
        multiValueHeaders: isALBEvent(event),
      });
    }

    // Convert to Node.js request format for SvelteKit
    const nodeRequest = convertWebRequestToNodeRequest(webRequest, event);

    // Create SvelteKit Request using official utilities
    const request = await getRequest({
      base: webRequest.url.split('/').slice(0, 3).join('/'), // Extract base URL
      request: nodeRequest,
      bodySizeLimit: body_size_limit,
    });

    // Process with SvelteKit Server (their proven approach)
    const response = await server.respond(request, {
      platform: {
        event,
        context,
        // Provide original node request for compatibility
        req: nodeRequest,
      },
      getClientAddress: () => extractClientIp(event),
    });

    // 🔥 Use our superior response conversion
    return await convertWebResponseToLambdaEvent(response, {
      binaryMediaTypes,
      multiValueHeaders: isALBEvent(event),
    });
  } catch (error) {
    console.error('Lambda handler error:', error);

    // Return proper error response
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: env('NODE_ENV') === 'development' ? error.message : 'An unexpected error occurred',
      }),
      isBase64Encoded: false,
    };
  }
};
