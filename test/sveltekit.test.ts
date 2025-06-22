import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LambdaAdapterOptions, SvelteKitBuilder } from '../src/index.js';
import adapter from '../src/index.js';

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
});
