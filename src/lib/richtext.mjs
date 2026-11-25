// Renders a news post body: a restricted rich-text document (the JSON the CMS editor produces, ProseMirror shape)
// into HTML. Only the node and mark types below are rendered, every text is escaped and link targets are limited to
// safe schemes, so a post body can never carry markup or script into the static site.
import { esc } from './html.mjs';

export const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

const BLOCKS = {
  paragraph: () => ['<p>', '</p>'],
  heading: (n) => { const l = n.attrs?.level === 3 ? 3 : 2; return [`<h${l}>`, `</h${l}>`]; },
  bulletList: () => ['<ul>', '</ul>'],
  orderedList: (n) => { const s = Number.isInteger(n.attrs?.start) && n.attrs.start > 1 ? ` start="${n.attrs.start}"` : ''; return [`<ol${s}>`, '</ol>']; },
  listItem: () => ['<li>', '</li>'],
  blockquote: () => ['<blockquote>', '</blockquote>'],
};

function text(n) {
  let out = esc(n.text);
  for (const m of n.marks || []) {
    if (m.type === 'bold') out = `<strong>${out}</strong>`;
    else if (m.type === 'italic') out = `<em>${out}</em>`;
    else if (m.type === 'link' && typeof m.attrs?.href === 'string' && SAFE_HREF.test(m.attrs.href.trim())) {
      const href = m.attrs.href.trim();
      out = /^https?:/i.test(href) ? `<a href="${esc(href)}" rel="noopener">${out}</a>` : `<a href="${esc(href)}">${out}</a>`;
    }
  }
  return out;
}

function node(n) {
  if (!n || typeof n !== 'object') return '';
  if (n.type === 'text') return typeof n.text === 'string' ? text(n) : '';
  if (n.type === 'hardBreak') return '<br>';
  const block = BLOCKS[n.type];
  if (!block) return '';
  // The editor keeps an empty paragraph after the last block; empty paragraphs and headings render as nothing.
  if ((n.type === 'paragraph' || n.type === 'heading') && !children(n)) return '';
  const [open, close] = block(n);
  return open + children(n) + close;
}

const children = (n) => (Array.isArray(n.content) ? n.content.map(node).join('') : '');

/** HTML string for a rich-text document ({ type: 'doc', content: [...] }); anything else renders as nothing. */
export function renderRichText(doc) {
  return doc && doc.type === 'doc' ? children(doc) : '';
}

