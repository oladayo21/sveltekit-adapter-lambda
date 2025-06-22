import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';

// SvelteKit Lambda adapter implementation

const files = fileURLToPath(new URL('../files', import.meta.url).href);

export interface LambdaAdapterOptions {
  /** Output directory for the Lambda function */
  out?: string;
  /** Whether to precompress static assets */
  precompress?: boolean;
  /** Binary media types for Lambda response encoding */
  binaryMediaTypes?: string[];
  /** Environment variable prefix */
  envPrefix?: string;
  /** Body size limit in bytes (default: 6MB) */
  bodySizeLimit?: number;
  /** Additional external dependencies to exclude from bundle */
  external?: string[];
}

export interface SvelteKitBuilder {
  log: {
    minor(message: string): void;
    success(message: string): void;
  };
  rimraf(path: string): void;
  writeClient(path: string): void;
  writePrerendered(path: string): void;
  writeServer(path: string): void;
  mkdirp(path: string): void;
  copy(
    from: string,
    to: string,
    opts?: {
      filter?: (basename: string) => boolean;
      replace?: Record<string, string>;
    }
  ): void;
  getBuildDirectory(name: string): string;
  generateManifest(opts: { relativePath: string }): string;
  prerendered: { paths: string[] };
  config: { kit: { paths: { base: string } } };
  compress?(dir: string): Promise<void>;
}

export default function adapter(options: LambdaAdapterOptions = {}) {
  const {
    out = 'build',
    precompress = false,
    envPrefix = '',
    binaryMediaTypes = [],
    bodySizeLimit = 6291456, // 6MB default
    external = [],
  } = options;

  return {
    name: '@foladayo/sveltekit-adapter-lambda',
    async adapt(builder: SvelteKitBuilder) {
      const tmp = builder.getBuildDirectory('sveltekit-adapter-lambda');

      builder.rimraf(out);
      builder.rimraf(tmp);
      builder.mkdirp(tmp);

      builder.log.minor('Copying assets');
      builder.writeClient(`${out}/client${builder.config.kit.paths.base}`);
      builder.writePrerendered(`${out}/prerendered${builder.config.kit.paths.base}`);

      if (precompress && builder.compress) {
        builder.log.minor('Compressing assets');
        await Promise.all([
          builder.compress(`${out}/client`),
          builder.compress(`${out}/prerendered`),
        ]);
      }

      builder.log.minor('Building server');

      builder.writeServer(tmp);

      // Generate manifest with all SvelteKit configuration
      writeFileSync(
        `${tmp}/manifest.js`,
        [
          `export const manifest = ${builder.generateManifest({ relativePath: './' })};`,
          `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
          `export const base = ${JSON.stringify(builder.config.kit.paths.base)};`,
        ].join('\n\n')
      );

      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

      // Bundle server code with Rollup for optimization
      builder.log.minor('Bundling server code');
      const bundle = await rollup({
        input: {
          index: `${tmp}/index.js`,
          manifest: `${tmp}/manifest.js`,
        },
        external: [
          // AWS SDK is available in Lambda runtime
          '@aws-sdk/client-s3',
          '@aws-sdk/client-dynamodb',
          'aws-lambda',
          // SvelteKit Node utilities
          '@sveltejs/kit/node',
          '@sveltejs/kit/node/polyfills',
          // User-specified external dependencies
          ...external,
          // All package dependencies except our core lambda-adapter-kit
          ...Object.keys(pkg.dependencies || {})
            .filter((dep) => dep !== '@foladayo/lambda-adapter-kit')
            .map((d) => new RegExp(`^${d}(\\/.*)?$`)),
        ],
        plugins: [
          nodeResolve({
            preferBuiltins: true,
            exportConditions: ['node'],
          }),
          commonjs({ strictRequires: true }),
          json(),
        ],
      });

      await bundle.write({
        dir: `${out}/server`,
        format: 'esm',
        sourcemap: true,
        chunkFileNames: 'chunks/[name]-[hash].js',
      });

      // Copy template files with replacements
      builder.log.minor('Generating Lambda handler');
      builder.copy(files, out, {
        replace: {
          ENV: './env.js',
          HANDLER: './handler.js',
          MANIFEST: './server/manifest.js',
          SERVER: './server/index.js',
          SHIMS: './shims.js',
          ENV_PREFIX: JSON.stringify(envPrefix),
          BINARY_MEDIA_TYPES: JSON.stringify(binaryMediaTypes),
          BODY_SIZE_LIMIT: bodySizeLimit.toString(),
        },
      });

      builder.log.success('AWS Lambda adapter complete');
    },

    supports: {
      read: () => true,
    },
  };
}
