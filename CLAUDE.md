# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **Name**: sveltekit-adapter-lambda  
- **Version**: 1.0.1-4
- **Type**: JavaScript Library (ES2022)
- **Purpose**: SvelteKit adapter for AWS Lambda deployment
- **Focus**: Zero-config Lambda deployment for SvelteKit apps
- **Versioning**: Follows Semantic Versioning (SemVer)

## Development Setup

- **Package Manager**: pnpm
- **Build Tool**: Rollup
- **Testing**: Vitest
- **Linting/Formatting**: Biome
- **TypeScript**: Yes (strict mode)

## Key Scripts

- `pnpm build` - Build the adapter using Rollup
- `pnpm dev` - Build in watch mode
- `pnpm test` - Run tests with Vitest
- `pnpm test:run` - Run tests once
- `pnpm test:coverage` - Run tests with coverage
- `pnpm lint` - Check code with Biome
- `pnpm lint:fix` - Fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm typecheck` - Type check with TypeScript

## Project Structure

```
src/
└── index.js      # SvelteKit Lambda adapter implementation

files/            # Template files for Lambda deployment (generated)
├── handler.js    # Lambda handler with bundled dependencies
├── index.js      # Entry point template
├── env.js        # Environment variable template
└── shims.js      # Node.js polyfills template

test/             # Test files
└── sveltekit.test.ts
```

## Dependencies

- **Core dependency**: `@foladayo/lambda-adapter-kit` (event conversion utilities)
- **Bundled dependencies**: `@foladayo/web-file-server`, `tiny-invariant` (bundled in handler)
- **Build dependencies**: Rollup plugins for bundling
- **Peer dependency**: `@sveltejs/kit ^2.0.0`

## Architecture Notes

### Core Components

- **Adapter Function** - Implements SvelteKit adapter interface with validation
- **Template System** - File-based templates with placeholder replacement
- **Rollup Integration** - Bundles server code and dependencies for optimal Lambda performance
- **Manifest Generation** - Creates SvelteKit route manifest for Lambda
- **Static File Server** - Optional high-performance static asset serving with security features

### Technical Details

- ESM-only library targeting Node.js ES2022
- Uses template files for Lambda handler generation
- Integrates with SvelteKit's official build system
- Leverages `@foladayo/lambda-adapter-kit` for robust event conversion
- Supports all Lambda event types (API Gateway v1/v2, ALB, Function URLs)
- Bundles `@foladayo/web-file-server` and `tiny-invariant` for zero external dependencies
- Comprehensive request validation and security hardening
- Response size protection for Lambda limits (6MB)

## Template System

The adapter uses template files in the `files/` directory:

- **handler.js** - Main Lambda handler with bundled dependencies (@foladayo/web-file-server, tiny-invariant)
- **index.js** - Entry point exporting the handler
- **env.js** - Environment variable handling with prefix support
- **shims.js** - Node.js polyfills for Lambda compatibility

Templates use placeholder replacement (ENV, HANDLER, MANIFEST, SERVE_STATIC, etc.) during build.

### Static Asset Serving Features

When `serveStatic: true` is enabled, the handler includes:

- **Security**: Path traversal protection, symlink blocking, sanitized headers
- **Performance**: Compression (Brotli/Gzip/Deflate), ETags, range requests, smart caching
- **Optimization**: Separate cache strategies for immutable vs regular assets
- **Lambda Integration**: Response size validation, proper error handling

## Code Style Guidelines

### Comments

- Add comments only where necessary to help understand complex logic
- No comments for comments' sake - avoid obvious or redundant explanations
- Focus on explaining "why" rather than "what" for non-obvious implementation details
- Document SvelteKit integration points and Lambda-specific optimizations

## Development Principles

- Always run all necessary checks after you create code to make sure everything works as they should
- Before committing and pushing to main, run the following checks:
  - `pnpm lint` to ensure code quality
  - `pnpm typecheck` to validate TypeScript types
  - `pnpm test:run` to confirm all tests pass
  - `pnpm build` to verify the build process works correctly