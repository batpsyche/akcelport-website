import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

// scrypt with OWASP-recommended parameters (N=2^17, r=8, p=1), 32-byte salt and key.
const N = 2 ** 17, R = 8, P = 1, KEYLEN = 32, MAXMEM = 256 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const [algo, n, r, p, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const actual = await derive(password, Buffer.from(saltB64, 'base64url'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Returns a problem description, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) return 'Use at least 10 characters';
  if (password.length > 200) return 'Use at most 200 characters';
  if (/^(.)\1+$/.test(password)) return 'Use more than one distinct character';
  return null;
}
