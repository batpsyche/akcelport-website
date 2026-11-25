// Minimal Supabase Storage client (REST over fetch, no SDK) for the serverless staging setup.
// The bucket holds:
//   media/<path>                    the media library (uploads; the seed copies public/img and public/downloads here)
//   objects/<sha256>/<file name>    content-addressed files of built sites, shared by every release
//   releases/<id>.json              one manifest per publish: { files: { "/path": { key, type, size } } }
//   preview.json                    manifest of the last preview build
//   state.json                      { current, releases: [{ id, createdAt }] }: the live pointer, newest release first
export interface StorageConfig { url: string; serviceKey: string; bucket: string }

export interface ManifestEntry { key: string; type: string; size: number }
export interface Manifest { id: string; createdAt: string; files: Record<string, ManifestEntry> }
export interface SiteState { current: string | null; releases: Array<{ id: string; createdAt: string }> }

export class Storage {
  constructor(private cfg: StorageConfig) {}

  private api(path: string) { return `${this.cfg.url}/storage/v1/${path}`; }
  private get auth() { return { authorization: `Bearer ${this.cfg.serviceKey}`, apikey: this.cfg.serviceKey }; }
  private objectPath(key: string) { return `${this.cfg.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`; }

  /** Public URL of an object (the bucket is public: it only ever holds the public website and its media). */
  publicUrl(key: string): string { return this.api(`object/public/${this.objectPath(key)}`); }

  async put(key: string, body: Buffer | string, contentType: string, cacheSeconds = 3600): Promise<void> {
    const res = await fetch(this.api(`object/${this.objectPath(key)}`), {
      method: 'POST',
      headers: { ...this.auth, 'content-type': contentType, 'x-upsert': 'true', 'cache-control': `max-age=${cacheSeconds}` },
      body: typeof body === 'string' ? body : new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Storage upload of ${key} failed: ${res.status} ${await res.text()}`);
  }

  /** The object's bytes, or null when it does not exist. Reads through the authenticated endpoint, so never a stale CDN copy. */
  async get(key: string): Promise<Buffer | null> {
    const res = await fetch(this.api(`object/authenticated/${this.objectPath(key)}`), { headers: this.auth });
    if (res.status === 404 || res.status === 400) { await res.body?.cancel(); return null; }
    if (!res.ok) throw new Error(`Storage read of ${key} failed: ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async getJson<T>(key: string): Promise<T | null> {
    const b = await this.get(key);
    return b ? (JSON.parse(b.toString('utf8')) as T) : null;
  }

  putJson(key: string, value: unknown): Promise<void> { return this.put(key, JSON.stringify(value), 'application/json', 0); }

  async remove(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 500) {
      const res = await fetch(this.api(`object/${encodeURIComponent(this.cfg.bucket)}`), {
        method: 'DELETE', headers: { ...this.auth, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: keys.slice(i, i + 500) }),
      });
      if (!res.ok) throw new Error(`Storage delete failed: ${res.status} ${await res.text()}`);
    }
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) await fn(items[next++]); }));
}
