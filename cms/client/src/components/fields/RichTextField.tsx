// A small rich-text editor (TipTap) for news posts. It offers only what the site renders: paragraphs, two heading
// levels, bulleted and numbered lists, quotes, bold, italic and links; pasted content outside that is dropped by the
// editor schema, and the server validates the result again (shared/rich-text.ts).
import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Link2, Unlink, Undo2, Redo2 } from 'lucide-react';
import type { RichDoc } from '@shared/rich-text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FieldWrap } from './Field';
import { cn } from '@/lib/utils';

// Same rule as SAFE_HREF in shared/rich-text.ts (kept here so the admin bundle does not pull in zod).
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?![\/\\])|#)/i;

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon" className={cn('size-8', active && 'bg-muted text-primary')} aria-label={label} title={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </Button>
  );
}

function LinkBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [href, setHref] = useState<string>(() => (editor.getAttributes('link').href as string | undefined) ?? 'https://');
  const valid = SAFE_HREF.test(href.trim());
  const apply = () => {
    if (!valid) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
    onClose();
  };
  return (
    <div className="flex items-center gap-2 border-b bg-muted/40 px-2 py-1.5">
      <Input autoFocus value={href} onChange={(e) => setHref(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') onClose(); }} placeholder="https://… or /products/…" className="h-8 font-mono text-xs" aria-label="Link address" aria-invalid={!valid} />
      <Button type="button" size="sm" onClick={apply} disabled={!valid}>Apply</Button>
      <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
    </div>
  );
}

export function RichTextField({ label, help, error, value, onChange }: { label?: string; help?: string; error?: string; value: RichDoc | undefined; onChange: (v: RichDoc) => void }) {
  const emitted = useRef<unknown>(value);
  const [linking, setLinking] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false, codeBlock: false, strike: false, underline: false, horizontalRule: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', isAllowedUri: (url) => SAFE_HREF.test(url) },
    })],
    content: value,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: 'rich-text min-h-56 px-3 py-2 focus:outline-none', 'aria-label': label ?? 'Post text' } },
    onUpdate: ({ editor: e }) => { const doc = e.getJSON() as RichDoc; emitted.current = doc; onChange(doc); },
  });
  // A new value from outside (load, revert, discard) replaces the editor content.
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(value ?? null, { emitUpdate: false });
  }, [editor, value]);
  if (!editor) return null;
  const chain = () => editor.chain().focus();
  return (
    <FieldWrap label={label} help={help} error={error}>
      <div className={cn('border bg-white rounded-sm', error && 'border-destructive')}>
        <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1" role="toolbar" aria-label="Formatting">
          <ToolButton label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}><Bold className="size-4" /></ToolButton>
          <ToolButton label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}><Italic className="size-4" /></ToolButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolButton label="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></ToolButton>
          <ToolButton label="Subheading" active={editor.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className="size-4" /></ToolButton>
          <ToolButton label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}><List className="size-4" /></ToolButton>
          <ToolButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolButton>
          <ToolButton label="Quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}><Quote className="size-4" /></ToolButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolButton label="Link" active={editor.isActive('link')} onClick={() => setLinking(true)}><Link2 className="size-4" /></ToolButton>
          <ToolButton label="Remove link" disabled={!editor.isActive('link')} onClick={() => chain().extendMarkRange('link').unsetLink().run()}><Unlink className="size-4" /></ToolButton>
          <span className="ml-auto" />
          <ToolButton label="Undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}><Undo2 className="size-4" /></ToolButton>
          <ToolButton label="Redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}><Redo2 className="size-4" /></ToolButton>
        </div>
        {linking && <LinkBar editor={editor} onClose={() => setLinking(false)} />}
        <EditorContent editor={editor} />
      </div>
    </FieldWrap>
  );
}
