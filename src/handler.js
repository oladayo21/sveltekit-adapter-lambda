import 'SHIMS';
import { env } from 'ENV';
import { manifest, prerendered } from 'MANIFEST';
import { Server } from 'SERVER';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  convertLambdaEventToWebRequest,
  convertWebResponseToLambdaEvent,
} from '@foladayo/lambda-adapter-kit';
import { createFileServer } from '@foladayo/web-file-server';
import invariant from 'tiny-invariant';

/* global ENV_PREFIX */

const server = new Server(manifest);

const _body_size_limit = Number.parseInt(env('BODY_SIZE_LIMIT', 'BODY_SIZE_LIMIT'));
const binaryMediaTypes = BINARY_MEDIA_TYPES;
const serveStatic = SERVE_STATIC;

// Get the directory of this handler file
const __dirname = dirname(fileURLToPath(import.meta.url));

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

// Create file server instances for different asset types
let clientFileServer = null;
let prerenderedFileServer = null;

if (serveStatic) {
  // Client assets - SvelteKit's built JS/CSS with aggressive caching for immutable files
  clientFileServer = createFileServer({
    root: join(__dirname, 'client'),
    compression: true,
    cacheControl: {
      '/_app/immutable/.*': 'public,max-age=31536000,immutable',
      '.*': 'public,max-age=3600',
    },
    etag: true,
  });

  // Prerendered pages - different caching strategy for HTML vs other assets
  prerenderedFileServer = createFileServer({
    root: join(__dirname, 'prerendered'),
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
export const handler = async (event, context) => {
  try {
    // Validate Lambda event structure
    validateLambdaEvent(event);

    const webRequest = convertLambdaEventToWebRequest(event);
    const pathname = new URL(webRequest.url).pathname;

    // Handle prerendered pages first
    if (serveStatic && prerendered.has(pathname) && prerenderedFileServer) {
      const prerenderedResponse = await prerenderedFileServer(webRequest);
      if (prerenderedResponse.status !== 404) {
        // Check response size before returning
        if (await isResponseTooLarge(prerenderedResponse)) {
          return await convertWebResponseToLambdaEvent(createOversizedResponse(), {
            binaryMediaTypes,
            multiValueHeaders: isALBEvent(event),
          });
        }
        return await convertWebResponseToLambdaEvent(prerenderedResponse, {
          binaryMediaTypes,
          multiValueHeaders: isALBEvent(event),
        });
      }
    }

    // Handle client assets (JS, CSS, images, etc.)
    if (serveStatic && clientFileServer) {
      const clientResponse = await clientFileServer(webRequest);
      if (clientResponse.status !== 404) {
        // Check response size before returning
        if (await isResponseTooLarge(clientResponse)) {
          return await convertWebResponseToLambdaEvent(createOversizedResponse(), {
            binaryMediaTypes,
            multiValueHeaders: isALBEvent(event),
          });
        }
        return await convertWebResponseToLambdaEvent(clientResponse, {
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
      return await convertWebResponseToLambdaEvent(createOversizedResponse(), {
        binaryMediaTypes,
        multiValueHeaders: isALBEvent(event),
      });
    }

    return await convertWebResponseToLambdaEvent(response, {
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
