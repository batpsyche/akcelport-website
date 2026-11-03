// Dependency-free file inspection: type by magic bytes, image dimensions from headers, PDF page count.

export type MediaKind = 'image' | 'pdf';

export interface MediaInfo {
  kind: MediaKind;
  mime: string;
  ext: string;
  width?: number;
  height?: number;
  pages?: number;
}

export function sniffMime(buf: Buffer): { mime: string; ext: string; kind: MediaKind } | undefined {
  if (buf.length >= 8 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf', kind: 'pdf' };
  return undefined;
}

export function pngSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return undefined;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function jpegSize(buf: Buffer): { width: number; height: number } | undefined {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return undefined;
}

export function webpSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 30) return undefined;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  return undefined;
}

/** Best-effort page count: counts page objects. Good enough to pre-fill a form; the editor can correct it. */
export function pdfPages(buf: Buffer): number | undefined {
  const text = buf.toString('latin1');
  const m = text.match(/\/Type\s*\/Page(?![s\w])/g);
  if (m && m.length) return m.length;
  const count = text.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/);
  if (count) return Number(count[1]);
  return undefined;
}

export function inspectBuffer(buf: Buffer): MediaInfo | undefined {
  const t = sniffMime(buf);
  if (!t) return undefined;
  const info: MediaInfo = { kind: t.kind, mime: t.mime, ext: t.ext };
  if (t.mime === 'image/png') Object.assign(info, pngSize(buf));
  else if (t.mime === 'image/jpeg') Object.assign(info, jpegSize(buf));
  else if (t.mime === 'image/webp') Object.assign(info, webpSize(buf));
  else if (t.mime === 'application/pdf') info.pages = pdfPages(buf);
  return info;
}
