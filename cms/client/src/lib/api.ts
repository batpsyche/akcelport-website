// Fetch wrapper for the JSON API: same-origin cookies, CSRF header on state-changing calls, typed errors.
export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: { issues?: Array<{ path: string; message: string }>; log?: string; [k: string]: unknown }) { super(message); }
  get issues() { return this.details?.issues ?? []; }
}

let csrfToken: string | null = null;
export const setCsrfToken = (t: string | null) => { csrfToken = t; };

export async function request<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isForm) headers['content-type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) headers['x-csrf-token'] = csrfToken;
  const res = await fetch(url, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body) });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('cms:unauthenticated'));
    const d = data as { error?: string; details?: ApiError['details'] } | null;
    throw new ApiError(res.status, d?.error ?? `Request failed (${res.status})`, d?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

export const mediaUrl = (src: string) => `/media/${src.replace(/^\//, '')}`;
