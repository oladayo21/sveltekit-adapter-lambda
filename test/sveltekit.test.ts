import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LambdaAdapterOptions } from '../index.d.ts';
import adapter from '../index.js';

interface SvelteKitBuilder {
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

// Mock fs functions
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock rollup
vi.mock('rollup', () => ({
  rollup: vi.fn(() => ({
    write: vi.fn(),
  })),
}));

// Mock rollup plugins
vi.mock('@rollup/plugin-node-resolve', () => ({
  nodeResolve: vi.fn(() => ({})),
}));

vi.mock('@rollup/plugin-commonjs', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('@rollup/plugin-json', () => ({
  default: vi.fn(() => ({})),
}));

const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('SvelteKit Lambda Adapter', () => {
  let mockBuilder: SvelteKitBuilder;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock package.json reading
    mockReadFileSync.mockReturnValue(JSON.stringify({ dependencies: {} }));

    mockBuilder = {
      log: {
        minor: vi.fn(),
        success: vi.fn(),
      },
      rimraf: vi.fn(),
      writeClient: vi.fn(),
      writePrerendered: vi.fn(),
      writeServer: vi.fn(),
      mkdirp: vi.fn(),
      copy: vi.fn(),
      getBuildDirectory: vi.fn((name) => `/tmp/${name}`),
      generateManifest: vi.fn(() => '{"routes":[]}'),
      prerendered: { paths: ['/about', '/contact'] },
      config: { kit: { paths: { base: '' } } },
      compress: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('adapter configuration', () => {
    it('should return adapter with correct name', () => {
      const adapterInstance = adapter();
      expect(adapterInstance.name).toBe('@foladayo/sveltekit-adapter-lambda');
    });

    it('should have adapt function', () => {
      const adapterInstance = adapter();
      expect(typeof adapterInstance.adapt).toBe('function');
    });

    it('should have supports.read method', () => {
      const adapterInstance = adapter();
      expect(adapterInstance.supports.read()).toBe(true);
    });
  });

  describe('build process', () => {
    it('should perform basic build steps with default options', async () => {
      const adapterInstance = adapter();
      await adapterInstance.adapt(mockBuilder);

      expect(mockBuilder.log.minor).toHaveBeenCalledWith('Copying assets');
      expect(mockBuilder.log.minor).toHaveBeenCalledWith('Building server');
      expect(mockBuilder.log.minor).toHaveBeenCalledWith('Bundling server code');
      expect(mockBuilder.log.minor).toHaveBeenCalledWith('Generating Lambda handler');
      expect(mockBuilder.rimraf).toHaveBeenCalledWith('build');
      expect(mockBuilder.writeClient).toHaveBeenCalledWith('build/client');
      expect(mockBuilder.writePrerendered).toHaveBeenCalledWith('build/prerendered');
      expect(mockBuilder.writeServer).toHaveBeenCalledWith('/tmp/sveltekit-adapter-lambda');
      expect(mockBuilder.generateManifest).toHaveBeenCalled();
      expect(mockBuilder.copy).toHaveBeenCalled();
      expect(mockBuilder.log.success).toHaveBeenCalledWith('AWS Lambda adapter complete');
    });

    it('should use custom output directory', async () => {
      const options: LambdaAdapterOptions = { out: 'lambda-dist' };
      const adapterInstance = adapter(options);
      await adapterInstance.adapt(mockBuilder);

      expect(mockBuilder.rimraf).toHaveBeenCalledWith('lambda-dist');
      expect(mockBuilder.writeClient).toHaveBeenCalledWith('lambda-dist/client');
      expect(mockBuilder.writePrerendered).toHaveBeenCalledWith('lambda-dist/prerendered');
    });

    it('should handle precompression when enabled', async () => {
      const options: LambdaAdapterOptions = { precompress: true };
      const adapterInstance = adapter(options);
      await adapterInstance.adapt(mockBuilder);

      expect(mockBuilder.log.minor).toHaveBeenCalledWith('Compressing assets');
      expect(mockBuilder.compress).toHaveBeenCalledWith('build/client');
      expect(mockBuilder.compress).toHaveBeenCalledWith('build/prerendered');
    });
  });

  describe('template file generation', () => {
    it('should generate manifest file', async () => {
      const adapterInstance = adapter();
      await adapterInstance.adapt(mockBuilder);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/tmp/sveltekit-adapter-lambda/manifest.js',
        expect.stringContaining('export const manifest = {"routes":[]}')
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/tmp/sveltekit-adapter-lambda/manifest.js',
        expect.stringContaining('export const prerendered = new Set(["/about","/contact"])')
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/tmp/sveltekit-adapter-lambda/manifest.js',
        expect.stringContaining('export const base = ""')
      );
    });

    it('should copy template files with correct replacements', async () => {
      const options: LambdaAdapterOptions = {
        binaryMediaTypes: ['image/*', 'application/pdf'],
        envPrefix: 'MY_APP_',
        bodySizeLimit: 1048576,
      };
      const adapterInstance = adapter(options);
      await adapterInstance.adapt(mockBuilder);

      expect(mockBuilder.copy).toHaveBeenCalledWith(expect.stringContaining('/files'), 'build', {
        replace: {
          ENV: './env.js',
          HANDLER: './handler.js',
          MANIFEST: './server/manifest.js',
          SERVER: './server/index.js',
          SHIMS: './shims.js',
          ENV_PREFIX: '"MY_APP_"',
          BINARY_MEDIA_TYPES: '["image/*","application/pdf"]',
          BODY_SIZE_LIMIT: '1048576',
          SERVE_STATIC: 'false',
        },
      });
    });
  });

  describe('options handling', () => {
    it('should handle all options together', async () => {
      const options: LambdaAdapterOptions = {
        out: 'dist',
        precompress: true,
        binaryMediaTypes: ['image/*', 'application/pdf'],
        envPrefix: 'MYAPP_',
        bodySizeLimit: 1048576,
        external: ['sharp', '@aws-sdk/client-s3'],
      };

      const adapterInstance = adapter(options);
      await adapterInstance.adapt(mockBuilder);

      // Verify build steps
      expect(mockBuilder.rimraf).toHaveBeenCalledWith('dist');
      expect(mockBuilder.writeClient).toHaveBeenCalledWith('dist/client');
      expect(mockBuilder.writeServer).toHaveBeenCalledWith('/tmp/sveltekit-adapter-lambda');

      // Verify template replacement
      expect(mockBuilder.copy).toHaveBeenCalledWith(
        expect.stringContaining('/files'),
        'dist',
        expect.objectContaining({
          replace: expect.objectContaining({
            ENV_PREFIX: '"MYAPP_"',
            BINARY_MEDIA_TYPES: '["image/*","application/pdf"]',
            BODY_SIZE_LIMIT: '1048576',
          }),
        })
      );

      expect(mockBuilder.log.success).toHaveBeenCalledWith('AWS Lambda adapter complete');
    });

    it('should handle undefined options gracefully', async () => {
      const adapterInstance = adapter(undefined);
      await adapterInstance.adapt(mockBuilder);

      expect(mockBuilder.rimraf).toHaveBeenCalledWith('build');
      expect(mockBuilder.log.success).toHaveBeenCalledWith('AWS Lambda adapter complete');
    });
  });

  describe('rollup integration', () => {
    it('should call rollup bundling', async () => {
      const adapterInstance = adapter();
      await adapterInstance.adapt(mockBuilder);

      // Verify that Rollup is used for bundling
      expect(mockBuilder.log.minor).toHaveBeenCalledWith('Bundling server code');
    });

    it('should handle external dependencies', async () => {
      const options: LambdaAdapterOptions = {
        external: ['custom-dep'],
      };
      const adapterInstance = adapter(options);
      await adapterInstance.adapt(mockBuilder);

      // Should complete successfully with external dependencies
      expect(mockBuilder.log.success).toHaveBeenCalledWith('AWS Lambda adapter complete');
    });
  });

  describe('configuration validation', () => {
    /* biome-ignore lint/suspicious/noExplicitAny: Testing with invalid types requires any */
    it('should validate out option', () => {
      expect(() => adapter({ out: '' })).toThrow('Option "out" must be a non-empty string');
      expect(() => adapter({ out: 123 as any })).toThrow('Option "out" must be a non-empty string');
    });

    it('should validate precompress option', () => {
      expect(() => adapter({ precompress: 'true' as any })).toThrow(
        'Option "precompress" must be a boolean'
      );
      expect(() => adapter({ precompress: 1 as any })).toThrow(
        'Option "precompress" must be a boolean'
      );
    });

    it('should validate envPrefix option', () => {
      expect(() => adapter({ envPrefix: 123 as any })).toThrow(
        'Option "envPrefix" must be a string'
      );
      expect(() => adapter({ envPrefix: null as any })).toThrow(
        'Option "envPrefix" must be a string'
      );
    });

    it('should validate binaryMediaTypes option', () => {
      expect(() => adapter({ binaryMediaTypes: 'image/*' as any })).toThrow(
        'Option "binaryMediaTypes" must be an array'
      );
      expect(() => adapter({ binaryMediaTypes: [123] as any })).toThrow(
        'All items in "binaryMediaTypes" must be non-empty strings'
      );
      expect(() => adapter({ binaryMediaTypes: [''] })).toThrow(
        'All items in "binaryMediaTypes" must be non-empty strings'
      );
    });

    it('should validate bodySizeLimit option', () => {
      expect(() => adapter({ bodySizeLimit: 0 })).toThrow(
        'Option "bodySizeLimit" must be a positive integer'
      );
      expect(() => adapter({ bodySizeLimit: -1 })).toThrow(
        'Option "bodySizeLimit" must be a positive integer'
      );
      expect(() => adapter({ bodySizeLimit: 1.5 })).toThrow(
        'Option "bodySizeLimit" must be a positive integer'
      );
      expect(() => adapter({ bodySizeLimit: 'large' as any })).toThrow(
        'Option "bodySizeLimit" must be a positive integer'
      );
    });

    it('should validate external option', () => {
      expect(() => adapter({ external: 'module' as any })).toThrow(
        'Option "external" must be an array'
      );
      expect(() => adapter({ external: [123] as any })).toThrow(
        'All items in "external" must be strings or RegExp objects'
      );
    });

    it('should validate serveStatic option', () => {
      expect(() => adapter({ serveStatic: 'true' as any })).toThrow(
        'Option "serveStatic" must be a boolean'
      );
      expect(() => adapter({ serveStatic: 1 as any })).toThrow(
        'Option "serveStatic" must be a boolean'
      );
    });

    it('should accept valid RegExp in external option', async () => {
      const options: LambdaAdapterOptions = {
        external: [/^aws-sdk/, 'custom-dep'],
      };
      const adapterInstance = adapter(options);
      await adapterInstance.adapt(mockBuilder);

      expect(mockBuilder.log.success).toHaveBeenCalledWith('AWS Lambda adapter complete');
    });

    it('should accept valid configuration', async () => {
      const options: LambdaAdapterOptions = {
        out: 'custom-build',
        precompress: true,
        envPrefix: 'MY_APP_',
        binaryMediaTypes: ['image/*', 'application/pdf'],
        bodySizeLimit: 1048576,
        external: ['aws-sdk'],
        serveStatic: true,
      };
      const adapterInstance = adapter(options);
      await adapterInstance.adapt(mockBuilder);

      expect(mockBuilder.log.success).toHaveBeenCalledWith('AWS Lambda adapter complete');
    });
  });
});
