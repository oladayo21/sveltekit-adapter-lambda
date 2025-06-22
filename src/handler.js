import 'SHIMS';
import { env } from 'ENV';
import { manifest, prerendered } from 'MANIFEST';
import { Server } from 'SERVER';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  convertLambdaEventToWebRequest,
  convertWebResponseToLambdaEvent,
} from '@foladayo/lambda-adapter-kit';

/* global ENV_PREFIX */

const server = new Server(manifest);

const _body_size_limit = Number.parseInt(env('BODY_SIZE_LIMIT', 'BODY_SIZE_LIMIT'));
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
 * Determine if event is from ALB (needs multiValueHeaders)
 * @param {any} event
 * @returns {boolean}
 */
function isALBEvent(event) {
  return event.requestContext && 'elb' in event.requestContext;
}

/**
 * Check if request is for static assets
 * @param {string} pathname
 * @returns {boolean}
 */
function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_app/') ||
    pathname.startsWith('/favicon.') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.ico')
  );
}

/**
 * Serve static files from the bundled client directory
 * @param {string} pathname - The requested pathname
 * @returns {Promise<Response|null>} - Response for static file or null if not found
 */
async function tryServeStaticFile(pathname) {
  try {
    const fullPath = join(__dirname, 'client', pathname);
    const content = readFileSync(fullPath);

    // Determine content type
    const ext = extname(pathname).toLowerCase();
    const contentType =
      {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
      }[ext] || 'application/octet-stream';

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': pathname.includes('/immutable/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      },
    });
  } catch {
    // File not found or error reading
    return null;
  }
}

/**
 * AWS Lambda handler with hybrid architecture
 * @param {any} event - Lambda Function URL, API Gateway, or ALB event
 * @param {any} context
 * @returns {Promise<any>}
 */
export const handler = async (event, context) => {
  try {
    const webRequest = convertLambdaEventToWebRequest(event);
    const pathname = new URL(webRequest.url).pathname;

    if (prerendered.has(pathname)) {
    } else if (isStaticAsset(pathname)) {
      const staticFileResponse = await tryServeStaticFile(pathname);
      if (staticFileResponse) {
        return await convertWebResponseToLambdaEvent(staticFileResponse, {
          binaryMediaTypes,
          multiValueHeaders: isALBEvent(event),
        });
      }
      // If static file not found, fall through to SvelteKit
    }

    const response = await server.respond(webRequest, {
      platform: {
        event,
        context,
        req: webRequest,
      },
      getClientAddress: () => extractClientIp(event),
    });

    return await convertWebResponseToLambdaEvent(response, {
      binaryMediaTypes,
      multiValueHeaders: isALBEvent(event),
    });
  } catch (error) {
    console.error('Lambda handler error:', error);

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
