import 'SHIMS';
import { env } from 'ENV';
import { manifest, prerendered } from 'MANIFEST';
import { Server } from 'SERVER';
import { readFileSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

function d(e){return "rawPath"in e}function p(e){return "requestContext"in e&&"elb"in e.requestContext}function h(e){return d(e)?e.requestContext.domainName||e.headers?.host||"localhost":p(e)?e.headers?.host||e.multiValueHeaders?.host?.[0]||"localhost":e.requestContext.domainName||e.headers?.host||"localhost"}function g(e){return d(e)?e.rawPath:e.path}function b(e){return d(e)?e.requestContext.http.method:e.httpMethod}function y(e){return d(e)?e.rawQueryString||"":e.multiValueQueryStringParameters?Object.entries(e.multiValueQueryStringParameters).filter(([,t])=>t&&t.length>0).flatMap(([t,n])=>n.map(r=>`${encodeURIComponent(t)}=${encodeURIComponent(r)}`)).join("&"):e.queryStringParameters?Object.entries(e.queryStringParameters).filter(([,t])=>t!=null).map(([t,n])=>`${encodeURIComponent(t)}=${encodeURIComponent(n)}`).join("&"):""}function E(e){let t=new Headers;return d(e)?(e.headers&&Object.entries(e.headers).forEach(([n,r])=>{r!=null&&t.set(n,r);}),e.cookies?.length&&t.set("cookie",e.cookies.join("; "))):(e.headers&&Object.entries(e.headers).forEach(([n,r])=>{r!=null&&t.set(n,r);}),e.multiValueHeaders&&Object.entries(e.multiValueHeaders).forEach(([n,r])=>{if(r?.length){let o=t.get(n);r.forEach(s=>{(!o||!o.includes(s))&&t.append(n,s);});}})),t}function R(e){return e.body?e.isBase64Encoded?Buffer.from(e.body,"base64"):e.body:null}function u(e){let t=h(e),n=g(e),r=b(e),o=y(e),s=E(e),a=R(e),i=new URL(n,`https://${t}`);return o&&(i.search=o),new Request(i,{method:r,headers:s,body:a})}function x(e,t=[]){let n=e.headers.get("content-type")||"",r=e.headers.get("content-encoding");return r&&/^(gzip|deflate|compress|br)/.test(r)?true:t.length>0?t.some(o=>n.includes(o)||o==="*/*"||o.endsWith("/*")&&n.startsWith(o.slice(0,-2))):!/^(text\/(plain|html|css|javascript|csv).*|application\/(.*json|.*xml).*|image\/svg\+xml.*)$/.test(n)}function L(e){if(!e.headers.has("set-cookie"))return [];if("getSetCookie"in e.headers&&typeof e.headers.getSetCookie=="function")return e.headers.getSetCookie();let t=[];return e.headers.forEach((n,r)=>{r.toLowerCase()==="set-cookie"&&t.push(n);}),t}function m(e,t=false){if(t){let r={};return e.headers.forEach((o,s)=>{s.toLowerCase()!=="set-cookie"&&(r[s]?r[s].push(o):r[s]=[o]);}),r}let n={};return e.headers.forEach((r,o)=>{o.toLowerCase()!=="set-cookie"&&(n[o]=r);}),n}async function l(e,t={}){let{binaryMediaTypes:n=[],multiValueHeaders:r=false}=t,o=await e.text(),s=x(e,n),a=L(e),i={statusCode:e.status,body:s?Buffer.from(o).toString("base64"):o,isBase64Encoded:s};if(r){let c={...i,multiValueHeaders:m(e,true)};return a.length>0&&(c.multiValueHeaders={...c.multiValueHeaders,"Set-Cookie":a}),c}let f={...i,headers:m(e,false)};return a.length>0&&(f.multiValueHeaders={"Set-Cookie":a}),f}

/* global ENV_PREFIX */

const server = new Server(manifest);

Number.parseInt(env('BODY_SIZE_LIMIT', 'BODY_SIZE_LIMIT'));
const binaryMediaTypes = BINARY_MEDIA_TYPES;
const serveStatic = SERVE_STATIC;

// Get the directory of this handler file
const __dirname = dirname(fileURLToPath(import.meta.url));

await server.init({
  env: process.env,
});

/**
 * Extract client IP address from Lambda event
 * @param {any} event - Lambda event
 * @returns {string}
 */
function extractClientIp(event) {
  // Try multiple sources for client IP
  const forwardedFor = event.headers?.['x-forwarded-for'];
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // API Gateway v2
  if (event.requestContext?.http?.sourceIp) {
    return event.requestContext.http.sourceIp;
  }

  // API Gateway v1
  if (event.requestContext?.identity?.sourceIp) {
    return event.requestContext.identity.sourceIp;
  }

  // ALB
  if (event.requestContext?.elb) {
    return event.headers?.['x-forwarded-for'] || '127.0.0.1';
  }

  return '127.0.0.1';
}

/**
 * Determine if event is from ALB (needs multiValueHeaders)
 * @param {any} event
 * @returns {boolean}
 */
function isALBEvent(event) {
  return event.requestContext && 'elb' in event.requestContext;
}

/**
 * Check if request is for static assets
 * @param {string} pathname
 * @returns {boolean}
 */
function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_app/') ||
    pathname.startsWith('/favicon.') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.gif') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.ico')
  );
}

/**
 * Serve static files from the bundled client directory
 * @param {string} pathname - The requested pathname
 * @returns {Promise<Response|null>} - Response for static file or null if not found
 */
async function tryServeStaticFile(pathname) {
  try {
    const fullPath = join(__dirname, 'client', pathname);
    const content = readFileSync(fullPath);

    // Determine content type
    const ext = extname(pathname).toLowerCase();
    const contentType =
      {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.eot': 'application/vnd.ms-fontobject',
      }[ext] || 'application/octet-stream';

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': pathname.includes('/immutable/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      },
    });
  } catch {
    // File not found or error reading
    return null;
  }
}

/**
 * AWS Lambda handler with hybrid architecture
 * @param {any} event - Lambda Function URL, API Gateway, or ALB event
 * @param {any} context
 * @returns {Promise<any>}
 */
const handler = async (event, context) => {
  try {
    const webRequest = u(event);
    const pathname = new URL(webRequest.url).pathname;

    if (prerendered.has(pathname)) {
      //TODO: Handle prerendered pages
    } else if (serveStatic && isStaticAsset(pathname)) {
      const staticFileResponse = await tryServeStaticFile(pathname);
      if (staticFileResponse) {
        return await l(staticFileResponse, {
          binaryMediaTypes,
          multiValueHeaders: isALBEvent(event),
        });
      }
      // If static file not found, fall through to SvelteKit
    }

    const response = await server.respond(webRequest, {
      platform: {
        event,
        context,
        req: webRequest,
      },
      getClientAddress: () => extractClientIp(event),
    });

    return await l(response, {
      binaryMediaTypes,
      multiValueHeaders: isALBEvent(event),
    });
  } catch (error) {
    console.error('Lambda handler error:', error);

    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: env('NODE_ENV') === 'development' ? error.message : 'An unexpected error occurred',
      }),
      isBase64Encoded: false,
    };
  }
};

export { handler };
