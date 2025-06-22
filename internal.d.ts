declare module 'ENV' {
  export function env(key: string, fallback?: string): string;
}

declare module 'HANDLER' {
  export const handler: (
    event: import('aws-lambda').APIGatewayProxyEvent,
    context: import('aws-lambda').Context
  ) => Promise<import('aws-lambda').APIGatewayProxyResult>;
}

declare module 'MANIFEST' {
  import { SSRManifest } from '@sveltejs/kit';

  export const base: string;
  export const manifest: SSRManifest;
  export const prerendered: Set<string>;
}

declare module 'SERVER' {
  export { Server } from '@sveltejs/kit';
}
