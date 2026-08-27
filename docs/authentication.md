# Authentication & Security Foundation (Phase 1)

WorkLens authentication is built on **[better-auth](https://better-auth.com)**,
which was already wired into the project scaffold (TanStack Start + Drizzle +
libSQL). Phase 1 hardened that setup rather than replacing it.

## Routes

| Route              | Purpose                                          | Guard                                                              |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| `/`                | Landing page                                     | Redirects to `/app` if already signed in                           |
| `/login`           | Email + password sign-in                         | Redirects to `/app` (or `?redirect=`) if signed in                 |
| `/signup`          | Create account (name, email, password, confirm)  | Redirects to `/app` if signed in                                   |
| `/forgot-password` | Request a reset link                             | Public                                                             |
| `/reset-password`  | Set a new password from a `?token=`              | Public                                                             |
| `/app/*`           | The authenticated application                    | `requireAuth` in `app.tsx` `beforeLoad` → `/login?redirect=<path>` |
| `/app/onboarding`  | Post-signup welcome screen                       | Under the `/app` guard                                             |
| `/api/auth/$`      | better-auth request handler (all auth endpoints) | better-auth's own origin + rate-limit checks                       |

## User flow

- **New user:** landing → `/signup` → account created + auto sign-in → `/app/onboarding` → dashboard.
- **Returning user:** landing → `/login` → `/app` (or back to the page they were trying to reach).

## Data model

better-auth owns the `user`, `session`, `account` and `verification` tables
(`src/lib/db/auth-schema.ts`). Phase 1 added:

- `user.status` — `active` | `suspended` | `deleted` (default `active`, indexed). A
  non-active account fails the session check even while holding a valid cookie.
- `user.lastLoginAt` — stamped by the `session.create` database hook on every
  genuine sign-in.
- `rate_limit` table — backs the database-backed rate limiter.

**The password hash is never on the `user` row.** It lives in
`account.password` (provider `credential`), is an Argon2id PHC string, and is
never included in any API response or SSR payload.

## Security decisions

### Password hashing — Argon2id

`src/lib/password.ts`. Argon2id via the pure-WASM `hash-wasm` package (not a
native addon) so the same code runs in Node, Bun and serverless/edge — the deploy
target is Vercel via Nitro, which bundles no native binaries. OWASP baseline
parameters: 19 MiB memory, 2 iterations, parallelism 1, 16-byte salt, 32-byte
hash. Stored as a self-describing PHC string so cost can be raised later without
breaking existing hashes. Wired into better-auth via
`emailAndPassword.password.{hash,verify}`, replacing its default scrypt.

### Sessions & cookies

- Opaque, signed session token in an **HttpOnly**, **SameSite=Lax** cookie,
  **Secure** in production (`advanced.defaultCookieAttributes` +
  `useSecureCookies`). No token is ever placed in `localStorage`/`sessionStorage`.
- 30-day expiry, re-issued after a day of activity.
- All sessions revoked on password reset (`revokeSessionsOnPasswordReset`).

### CSRF

- **better-auth endpoints:** better-auth validates the `Origin`/`Referer` header
  against `trustedOrigins` (pinned to `BETTER_AUTH_URL`). Combined with
  `SameSite=Lax` this covers cross-site POST.
- **TanStack server functions:** `createCsrfMiddleware` in `src/start.ts`
  (unchanged from scaffold) rejects cross-site RPCs.

### Rate limiting

better-auth's built-in limiter, `storage: "database"` (an in-memory counter
would reset on every serverless cold start). Global 100 req / 60 s per IP, with
stricter per-route rules:

| Endpoint                  | Limit      |
| ------------------------- | ---------- |
| `/sign-in/email`          | 5 / 60 s   |
| `/sign-up/email`          | 5 / 60 s   |
| `/request-password-reset` | 3 / 15 min |
| `/reset-password`         | 5 / 15 min |

Exceeding a limit returns `429` with a generic body.

### Account enumeration

- **Login:** identical `401` body (`"Invalid email or password"`) for wrong
  password and unknown email. better-auth runs the password verify against a
  dummy hash for unknown users to equalise timing.
- **Password reset:** identical `200` body for known and unknown emails;
  better-auth simulates the token/DB work for unknown emails.
- **Signup:** a duplicate email _is_ reported ("account already exists"). Silently
  accepting a duplicate is impossible, and Phase 1 has no email-verification
  step to hide it behind. Accepted trade-off, revisit when email verification
  lands.

### Server-side authorization

- `readSessionUser(headers)` (`src/lib/auth-guard.ts`) is the single source of
  truth: reads the cookie server-side, then applies the `status === "active"`
  gate (and tears down the session for a suspended account).
- `getSessionUser` / `getCurrentUser` server functions expose only a trimmed,
  non-sensitive user shape to the client.
- `requireAuth` — route `beforeLoad` guard for `/app/*` (UX redirect).
- `requireUser()` — throw-if-unauthenticated helper for the data boundary. Route
  guards are **not** the data boundary; every server function that touches
  private data still checks the session itself.

### HTTP security headers

`src/lib/security-headers.ts`, applied to every response by a global request
middleware in `src/start.ts`:

- `Content-Security-Policy` — `default-src 'self'`; inline scripts allowed
  (TanStack Start emits un-nonced bootstrap scripts); `frame-ancestors 'none'`;
  Google Fonts allow-listed; `img-src` allows `https:` for OAuth avatars. Dev
  additionally allows `'unsafe-eval'` and `ws:` for Vite HMR.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` (camera/mic/geo/topics denied),
  `Cross-Origin-Opener-Policy: same-origin`.
- `Strict-Transport-Security` — production only.

### Input validation

- Server: better-auth validates every auth endpoint body (email format, password
  length). Server functions use `.validator()`.
- Client: the signup and reset forms enforce a password policy
  (`checkPasswordPolicy` — length + a small common-password denylist) and
  confirm-password match before calling the API. `redirect` search params are
  constrained to app-internal paths (no open redirect).

### Secrets

`BETTER_AUTH_SECRET` and OAuth credentials come from environment variables only;
none reach the client. The server refuses to boot in production without
`BETTER_AUTH_SECRET`. See `.env.example`.

## OAuth

Google / GitHub / LinkedIn buttons render **only** when that provider's
`_CLIENT_ID` + `_CLIENT_SECRET` are set (`enabledProviders` in `src/lib/auth.ts`).
No placeholder / non-functional buttons. This was already the scaffold's
behaviour and was left intact.

## Tests

`bun test` — see `tests/auth.test.ts` (signup, duplicate email, invalid input,
login, wrong password + enumeration parity, logout, `readSessionUser`
authorization incl. suspended accounts, `lastLoginAt`, password-reset parity,
Argon2id hashing/policy) and `tests/auth-rate-limit.test.ts` (429 after the
per-route sign-in limit).
