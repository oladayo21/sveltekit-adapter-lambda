import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';
import invariant from 'tiny-invariant';

const files = fileURLToPath(new URL('./files', import.meta.url).href);

/** @type {import('./index.js').default} */
export default function adapter(options = {}) {
  const {
    out = 'build',
    precompress = false,
    envPrefix = '',
    binaryMediaTypes = [],
    bodySizeLimit = 6291456, // 6MB default
    external = [],
    serveStatic = false,
  } = options;

  // Validate configuration options using tiny-invariant
  invariant(
    typeof out === 'string' && out.trim() !== '',
    'Option "out" must be a non-empty string'
  );
  invariant(typeof precompress === 'boolean', 'Option "precompress" must be a boolean');
  invariant(typeof envPrefix === 'string', 'Option "envPrefix" must be a string');
  invariant(Array.isArray(binaryMediaTypes), 'Option "binaryMediaTypes" must be an array');

  // Validate binaryMediaTypes contains valid MIME patterns
  for (const mediaType of binaryMediaTypes) {
    invariant(
      typeof mediaType === 'string' && mediaType.trim() !== '',
      'All items in "binaryMediaTypes" must be non-empty strings'
    );
  }

  invariant(
    typeof bodySizeLimit === 'number' && bodySizeLimit > 0 && Number.isInteger(bodySizeLimit),
    'Option "bodySizeLimit" must be a positive integer'
  );

  invariant(Array.isArray(external), 'Option "external" must be an array');

  for (const ext of external) {
    const isString = typeof ext === 'string';
    const isRegExp =
      ext && typeof ext === 'object' && Object.prototype.toString.call(ext) === '[object RegExp]';
    invariant(isString || isRegExp, 'All items in "external" must be strings or RegExp objects');
  }

  invariant(typeof serveStatic === 'boolean', 'Option "serveStatic" must be a boolean');

  return {
    name: '@foladayo/sveltekit-adapter-lambda',
    async adapt(builder) {
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

      writeFileSync(
        `${tmp}/manifest.js`,
        [
          `export const manifest = ${builder.generateManifest({ relativePath: './' })};`,
          `export const prerendered = new Set(${JSON.stringify(builder.prerendered.paths)});`,
          `export const base = ${JSON.stringify(builder.config.kit.paths.base)};`,
        ].join('\n\n')
      );

      const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

      builder.log.minor('Bundling server code');
      const bundle = await rollup({
        input: {
          index: `${tmp}/index.js`,
          manifest: `${tmp}/manifest.js`,
        },
        external: [
          // Dependencies could have deep exports, so we need a regex
          ...Object.keys(pkg.dependencies || {}).map((d) => new RegExp(`^${d}(\\/.*)?$`)),
          // User-specified external dependencies
          ...external,
        ],
        plugins: [
          nodeResolve({
            preferBuiltins: true,
            exportConditions: ['node'],
          }),
          // @ts-ignore https://github.com/rollup/plugins/issues/1329
          commonjs({ strictRequires: true }),
          // @ts-ignore https://github.com/rollup/plugins/issues/1329
          json(),
        ],
      });

      await bundle.write({
        dir: `${out}/server`,
        format: 'esm',
        sourcemap: true,
        chunkFileNames: 'chunks/[name]-[hash].js',
      });

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
          SERVE_STATIC: JSON.stringify(serveStatic),
        },
      });

      builder.log.success('AWS Lambda adapter complete');
    },

    supports: {
      read: () => true,
    },
  };
}
