import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

export const cmsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Loads cms/.env into process.env (values already set in the environment win). No dependency on dotenv. */
export function loadDotEnv(file = resolve(cmsRoot, '.env')): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export interface Config {
  nodeEnv: string;
  logLevel: string;
  databaseUrl: string;
  sessionSecret: string;
  port: number;
  sitePort: number;
  mediaDir: string;
  publishDir: string;
  siteRoot: string;
  siteUrl: string | undefined;
  publishKeep: number;
  sessionSecure: boolean;
  trustProxy: boolean;
  sessionIdleMs: number;
  sessionMaxMs: number;
  uploadImageMaxBytes: number;
  uploadPdfMaxBytes: number;
}

const bool = (v: string | undefined, dflt: boolean) => (v === undefined || v === '' ? dflt : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));
const num = (v: string | undefined, dflt: number) => { const n = Number(v); return v === undefined || v === '' || !Number.isFinite(n) ? dflt : n; };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV || 'development';
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required (see cms/.env.example)');
  const sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET is required and must be at least 32 characters (see cms/.env.example)');
  return {
    nodeEnv,
    logLevel: env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info'),
    databaseUrl,
    sessionSecret,
    port: num(env.PORT, 3000),
    sitePort: num(env.SITE_PORT, 4174),
    mediaDir: resolve(cmsRoot, env.MEDIA_DIR || './data/media'),
    publishDir: resolve(cmsRoot, env.PUBLISH_DIR || './data/publish'),
    siteRoot: resolve(cmsRoot, env.SITE_ROOT || '..'),
    siteUrl: env.SITE_URL || undefined,
    publishKeep: Math.max(1, num(env.PUBLISH_KEEP, 5)),
    sessionSecure: bool(env.SESSION_SECURE, nodeEnv === 'production'),
    trustProxy: bool(env.TRUST_PROXY, false),
    sessionIdleMs: num(env.SESSION_IDLE_HOURS, 12) * 3600_000,
    sessionMaxMs: num(env.SESSION_MAX_DAYS, 7) * 86400_000,
    uploadImageMaxBytes: num(env.UPLOAD_IMAGE_MAX_MB, 10) * 1024 * 1024,
    uploadPdfMaxBytes: num(env.UPLOAD_PDF_MAX_MB, 25) * 1024 * 1024,
  };
}
