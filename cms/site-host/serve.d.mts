import type { IncomingMessage, ServerResponse } from 'node:http';
export function createSiteHandler(opts: {
  url: string; bucket: string; manifest: 'current' | 'preview'; base?: string; cacheMs?: number; cacheControl?: (type: string) => string;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
