# @foladayo/sveltekit-adapter-lambda

**AWS Lambda adapter for SvelteKit applications**

[![npm version](https://img.shields.io/npm/v/@foladayo/sveltekit-adapter-lambda)](https://www.npmjs.com/package/@foladayo/sveltekit-adapter-lambda)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)

## Installation

```bash
npm install @foladayo/sveltekit-adapter-lambda
```

## Usage

```javascript
// svelte.config.js
import adapter from "@foladayo/sveltekit-adapter-lambda";

export default {
  kit: {
    adapter: adapter(),
  },
};
```

```bash
npm run build
```

The adapter generates a `build/` directory with your Lambda function:

```javascript
import { handler } from "./build/index.js";
```

Use `index.handler` as your Lambda function handler.

## Configuration Options

```javascript
// svelte.config.js
import adapter from "@foladayo/sveltekit-adapter-lambda";

export default {
  kit: {
    adapter: adapter({
      out: "build", // Output directory (default: 'build')
      precompress: false, // Gzip assets (default: false)
      binaryMediaTypes: ["image/*"], // Binary content types for base64 encoding
      bodySizeLimit: 6291456, // Body size limit in bytes (6MB default)
      envPrefix: "MY_APP_", // Environment variable prefix
      external: ["@aws-sdk/client-s3"], // Additional external dependencies
      serveStatic: false, // Serve static assets from Lambda (default: false)
    }),
  },
};
```

## Static Asset Serving

By default, this adapter is optimized for **SSR (Server-Side Rendering) only** and does not serve static assets from Lambda.

### Recommended Setup (Default)

```javascript
adapter({
  serveStatic: false, // Default - Lambda handles SSR only
});
```

Use **CloudFront + S3** to serve static assets for optimal performance and cost efficiency.

### Lambda Static Serving (Optional)

```javascript
adapter({
  serveStatic: true, // Serves static assets from Lambda with optimized caching
});
```

When enabled, the adapter uses **[@foladayo/web-file-server](https://www.npmjs.com/package/@foladayo/web-file-server)** for high-performance static asset serving with:

- **Compression Support**: Brotli, Gzip, Deflate with precompressed file detection
- **Smart Caching**: Immutable assets get 1-year cache, regular assets get 1-hour cache
- **Security Features**: Path traversal protection, symlink blocking, sanitized headers
- **Range Requests**: Support for partial content delivery
- **Conditional Requests**: ETags and Last-Modified headers for cache validation

⚠️ **Note**: While optimized, serving static assets from Lambda still increases costs compared to CloudFront + S3. Use `serveStatic: true` for simple deployments or when you need centralized asset serving.

## Lambda Handler

The generated handler function is located at `build/index.handler` and supports:

- **API Gateway v1/v2** events
- **Application Load Balancer** events
- **Lambda Function URLs** events
- **Automatic binary content detection** and base64 encoding
- **Multi-value headers and cookies**
- **Request validation** with comprehensive error handling
- **Response size protection** (6MB Lambda limit enforcement)
- **Security hardening** with input sanitization

## Accessing Lambda Context

```typescript
// src/routes/+page.server.js
export async function load({ platform }) {
  const requestId = platform?.context?.awsRequestId;
  const timeRemaining = platform?.context?.getRemainingTimeInMillis();
  const event = platform?.event; // Original Lambda event

  return { requestId, timeRemaining };
}
```

## Environment Variables

Environment variables are available through `process.env`. If you configure an `envPrefix`, the adapter will look for prefixed environment variables:

```javascript
// With envPrefix: 'MY_APP_'
adapter({
  envPrefix: "MY_APP_",
});

// Environment: MY_APP_DATABASE_URL=postgres://...
// Access as: process.env.MY_APP_DATABASE_URL
```

## Requirements

- **Node.js**: 22+ (LTS)
- **SvelteKit**: 2.0+
- **AWS Lambda**: nodejs22.x runtime
