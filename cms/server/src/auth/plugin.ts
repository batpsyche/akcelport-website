// Session cookie authentication, CSRF protection and role guards.
// - The cookie is HttpOnly, SameSite=Strict, Secure (when configured), signed; its value is a random token whose hash is the session id.
// - Every state-changing /api request must carry an Origin (or Sec-Fetch-Site) that matches the host, and an x-csrf-token header
//   equal to the session's token. Roles and the temporary-password state are enforced here, on the server, never only in the UI.
import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import type pg from 'pg';
import type { Config } from '../config.ts';
import { SESSION_COOKIE, findSession, type Session, type SessionUser } from './session.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    session: Session | null;
    sessionToken: string | null;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// A user signed in with a temporary password may only look themselves up, change the password or sign out.
const PASSWORD_CHANGE_EXEMPT = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout']);

export function originAllowed(req: FastifyRequest): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin) {
    try { return new URL(origin).host === new URL(`http://${host ?? ''}`).host; } catch { return false; }
  }
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  return true;
}

export const authPlugin = fp(async function authPlugin(app: FastifyInstance, opts: { pool: pg.Pool; config: Config }) {
  app.decorateRequest('user', null);
  app.decorateRequest('session', null);
  app.decorateRequest('sessionToken', null);

  app.addHook('onRequest', async (req) => {
    const raw = req.cookies[SESSION_COOKIE];
    if (!raw) return;
    const unsigned = req.unsignCookie(raw);
    if (!unsigned.valid || !unsigned.value) return;
    const found = await findSession(opts.pool, unsigned.value, opts.config);
    if (!found) return;
    req.user = found.user;
    req.session = found.session;
    req.sessionToken = unsigned.value;
  });

  app.addHook('preHandler', async (req) => {
    // Matched route, not req.url: the router percent-decodes before matching, so an encoded /api/ spelling
    // must still get the CSRF and password-change checks.
    const route = req.routeOptions.url ?? '';
    if (!route.startsWith('/api/')) return;
    if (!SAFE_METHODS.has(req.method)) {
      if (!originAllowed(req)) throw new HttpError(403, 'Cross-site request refused');
      if (req.session) {
        const header = req.headers['x-csrf-token'];
        if (typeof header !== 'string' || header.length !== req.session.csrfToken.length || !safeEqual(header, req.session.csrfToken)) {
          throw new HttpError(403, 'Missing or invalid CSRF token');
        }
      }
    }
    if (req.user?.mustChangePassword && !PASSWORD_CHANGE_EXEMPT.has(route)) {
      throw new HttpError(403, 'Choose your own password before continuing', { code: 'password_change_required' });
    }
  });
});

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const requireAuth: preHandlerHookHandler = async (req) => {
  if (!req.user) throw new HttpError(401, 'Sign in to continue');
};

export const requireAdmin: preHandlerHookHandler = async (req) => {
  if (!req.user) throw new HttpError(401, 'Sign in to continue');
  if (req.user.role !== 'admin') throw new HttpError(403, 'Administrator access required');
};

export function setSessionCookie(reply: FastifyReply, token: string, config: Config): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/', httpOnly: true, sameSite: 'strict', secure: config.sessionSecure, signed: true, maxAge: Math.floor(config.sessionMaxMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'strict', secure: config.sessionSecure });
}
