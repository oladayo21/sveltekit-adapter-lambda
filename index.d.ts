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

declare function adapter(options?: LambdaAdapterOptions): {
  name: string;
  adapt(builder: SvelteKitBuilder): Promise<void>;
  supports: {
    read(): boolean;
  };
};

export default adapter;
