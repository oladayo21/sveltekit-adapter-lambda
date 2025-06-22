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
import adapter from '@foladayo/sveltekit-adapter-lambda';

export default {
  kit: {
    adapter: adapter()
  }
};
```

```bash
npm run build
```

The adapter generates a `build/` directory with your Lambda function:

```javascript
import { handler } from './build/index.js';
```

Use `index.handler` as your Lambda function handler.

## Configuration Options

```javascript
// svelte.config.js
import adapter from '@foladayo/sveltekit-adapter-lambda';

export default {
  kit: {
    adapter: adapter({
      out: 'build',                      // Output directory (default: 'build')
      precompress: false,                // Gzip assets (default: false)
      binaryMediaTypes: ['image/*'],     // Binary content types for base64 encoding
      bodySizeLimit: 6291456,           // Body size limit in bytes (6MB default)
      envPrefix: 'MY_APP_',             // Environment variable prefix
      external: ['@aws-sdk/client-s3']   // Additional external dependencies
    })
  }
};
```

## Lambda Handler

The generated handler function is located at `build/index.handler` and supports:

- **API Gateway v1/v2** events
- **Application Load Balancer** events  
- **Lambda Function URLs** events
- Automatic binary content detection and base64 encoding
- Multi-value headers and cookies

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
  envPrefix: 'MY_APP_'
})

// Environment: MY_APP_DATABASE_URL=postgres://...
// Access as: process.env.MY_APP_DATABASE_URL
```

## Requirements

- **Node.js**: 22+ (LTS)
- **SvelteKit**: 2.0+
- **AWS Lambda**: nodejs22.x runtime