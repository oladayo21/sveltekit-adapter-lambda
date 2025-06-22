# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

- **Name**: sveltekit-adapter-lambda  
- **Version**: 1.0.0
- **Type**: TypeScript Library
- **Purpose**: SvelteKit adapter for AWS Lambda deployment
- **Focus**: Zero-config Lambda deployment for SvelteKit apps
- **Versioning**: Follows Semantic Versioning (SemVer)

## Development Setup

- **Package Manager**: pnpm
- **Build Tool**: tsup
- **Testing**: Vitest
- **Linting/Formatting**: Biome
- **TypeScript**: Yes (strict mode)

## Key Scripts

- `pnpm build` - Build the adapter using tsup
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
└── index.ts      # SvelteKit Lambda adapter implementation

files/            # Template files for Lambda deployment
├── handler.js    # Lambda handler template
├── index.js      # Entry point template
├── env.js        # Environment variable template
└── shims.js      # Node.js polyfills template

test/             # Test files
└── sveltekit.test.ts

dist/             # Build output (generated)
```

## Dependencies

- **Core dependency**: `@foladayo/lambda-adapter-kit` (event conversion utilities)
- **Build dependencies**: Rollup plugins for bundling
- **Peer dependency**: `@sveltejs/kit ^2.0.0`

## Architecture Notes

### Core Components

- **Adapter Function** - Implements SvelteKit adapter interface
- **Template System** - File-based templates with placeholder replacement
- **Rollup Integration** - Bundles server code for optimal Lambda performance
- **Manifest Generation** - Creates SvelteKit route manifest for Lambda

### Technical Details

- ESM-only library targeting Node.js ES2022
- Uses template files for Lambda handler generation
- Integrates with SvelteKit's official build system
- Leverages `@foladayo/lambda-adapter-kit` for robust event conversion
- Supports all Lambda event types (API Gateway v1/v2, ALB, Function URLs)

## Template System

The adapter uses template files in the `files/` directory:

- **handler.js** - Main Lambda handler using core utilities
- **index.js** - Entry point exporting the handler
- **env.js** - Environment variable handling
- **shims.js** - Node.js polyfills for Lambda compatibility

Templates use placeholder replacement (ENV, HANDLER, MANIFEST, etc.) during build.

## Code Style Guidelines

### Comments

- Add comments only where necessary to help understand complex logic
- No comments for comments' sake - avoid obvious or redundant explanations
- Focus on explaining "why" rather than "what" for non-obvious implementation details
- Document SvelteKit integration points and Lambda-specific optimizations

## Development Principles

- Always run all necessary checks after you create code to make sure everything works as they should