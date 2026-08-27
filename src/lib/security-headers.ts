/**
 * Security response headers, applied to every request by the global request
 * middleware in src/start.ts.
 *
 * Kept conservative on purpose — this is a server-rendered app with no embedded
 * third-party frames or cross-origin XHR, so the restrictive values below don't
 * break anything the app actually does.
 */

const isProduction = process.env["NODE_ENV"] === "production";

/**
 * Content-Security-Policy.
 *
 * - `script-src 'self' 'unsafe-inline'` — TanStack Start emits inline bootstrap
 *   scripts (router state, hydration) and does not use nonces, so inline script
 *   must be allowed. Dev additionally needs `'unsafe-eval'` for Vite's module
 *   runner and `ws:` for HMR.
 * - `style-src` allows inline styles (Tailwind-in-JS, style attributes) and the
 *   Google Fonts stylesheet; `font-src` the font files.
 * - `img-src` includes `https:` so OAuth provider avatar URLs render.
 * - `frame-ancestors 'none'` is the CSP-level equivalent of X-Frame-Options.
 */
function contentSecurityPolicy(): string {
  const scriptSrc = isProduction
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = isProduction ? "'self'" : "'self' ws: wss:";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src ${connectSrc}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function securityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (isProduction) {
    // 180 days; add `; preload` only once you're committed to HTTPS-forever.
    headers["Strict-Transport-Security"] = "max-age=15552000; includeSubDomains";
  }
  return headers;
}

/** Mutates a Response in place with the security headers (skips ones already set). */
export function applySecurityHeaders(response: Response): Response {
  try {
    for (const [name, value] of Object.entries(securityHeaders())) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    return response;
  } catch {
    // Some Response instances have immutable headers — rebuild in that case.
    const merged = new Headers(response.headers);
    for (const [name, value] of Object.entries(securityHeaders())) {
      if (!merged.has(name)) merged.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: merged,
    });
  }
}
