// The rich-text format of a news post body: the editor's JSON document (ProseMirror shape) limited to a few node and
// mark types. Parsing drops every attribute the site does not use, rejects anything else, and only lets links point
// at http(s), mailto, tel, site-relative paths or anchors. The site generator renders the same subset (src/lib/richtext.mjs)
// and escapes all text, so a published body cannot carry HTML or script.
import { z } from 'zod';

export const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

const markSchema = z.union([
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('link'), attrs: z.object({ href: z.string().trim().regex(SAFE_HREF, 'Links must start with https://, http://, mailto:, tel: or /') }) }),
]);

const inlineSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string().min(1), marks: z.array(markSchema).optional() }),
  z.object({ type: z.literal('hardBreak') }),
]);
type Inline = z.infer<typeof inlineSchema>;

export type RichBlock =
  | { type: 'paragraph'; content?: Inline[] }
  | { type: 'heading'; attrs: { level: 2 | 3 }; content?: Inline[] }
  | { type: 'bulletList'; content: RichListItem[] }
  | { type: 'orderedList'; attrs?: { start?: number }; content: RichListItem[] }
  | { type: 'blockquote'; content: RichBlock[] };
export interface RichListItem { type: 'listItem'; content: RichBlock[] }
export interface RichDoc { type: 'doc'; content: RichBlock[] }

const blockSchema: z.ZodType<RichBlock> = z.lazy(() => z.union([
  z.object({ type: z.literal('paragraph'), content: z.array(inlineSchema).optional() }),
  z.object({ type: z.literal('heading'), attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }), content: z.array(inlineSchema).optional() }),
  z.object({ type: z.literal('bulletList'), content: z.array(listItemSchema).min(1) }),
  z.object({ type: z.literal('orderedList'), attrs: z.object({ start: z.number().int().min(1).optional() }).optional(), content: z.array(listItemSchema).min(1) }),
  z.object({ type: z.literal('blockquote'), content: z.array(blockSchema).min(1) }),
]));
const listItemSchema: z.ZodType<RichListItem> = z.lazy(() => z.object({ type: z.literal('listItem'), content: z.array(blockSchema).min(1) }));

const hasText = (v: unknown): boolean => {
  if (!v || typeof v !== 'object') return false;
  const n = v as { type?: string; text?: string; content?: unknown[] };
  return (n.type === 'text' && !!n.text?.trim()) || (Array.isArray(n.content) && n.content.some(hasText));
};

export const richTextDocSchema: z.ZodType<RichDoc> = z.object({ type: z.literal('doc'), content: z.array(blockSchema) })
  .refine(hasText, 'Write the post text');

export const emptyRichDoc = (): RichDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] });
