// Spec table editor: columns and rows as a grid, with paste from a spreadsheet (tab-separated) into any cell or the whole table.
import { useState, type ClipboardEvent } from 'react';
import { Plus, X, ClipboardPaste, Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FieldWrap } from './Field';

export interface TableValue { columns: string[]; rows: string[][] }

/** Spreadsheet clipboard text: tabs separate columns, lines separate rows. A value with commas or semicolons stays one cell. */
export function parseClipboard(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  return lines.map((l) => l.split('\t').map((c) => c.trim()));
}

const normalise = (v: TableValue): TableValue => ({ columns: v.columns, rows: v.rows.map((r) => Array.from({ length: v.columns.length }, (_, i) => r[i] ?? '')) });

export function TableEditor({ label, help, error, value, onChange }: { label?: string; help?: string; error?: string; value: TableValue | undefined; onChange: (v: TableValue) => void }) {
  const v = normalise(value ?? { columns: [''], rows: [] });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [headerRow, setHeaderRow] = useState(true);

  const setCell = (r: number, c: number, text: string) => onChange({ ...v, rows: v.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? text : x)) : row)) });
  const setCol = (c: number, text: string) => onChange({ ...v, columns: v.columns.map((x, j) => (j === c ? text : x)) });
  const addRow = () => onChange({ ...v, rows: [...v.rows, v.columns.map(() => '')] });
  const removeRow = (r: number) => onChange({ ...v, rows: v.rows.filter((_, i) => i !== r) });
  const addCol = () => onChange({ columns: [...v.columns, ''], rows: v.rows.map((row) => [...row, '']) });
  const removeCol = (c: number) => onChange({ columns: v.columns.filter((_, j) => j !== c), rows: v.rows.map((row) => row.filter((_, j) => j !== c)) });

  /** Fill a block starting at (r, c) from pasted cells, growing the table as needed. r = -1 targets the header row. */
  const fillFrom = (r: number, c: number, cells: string[][]) => {
    let columns = [...v.columns];
    let rows = v.rows.map((row) => [...row]);
    const width = Math.max(columns.length, c + Math.max(...cells.map((x) => x.length)));
    while (columns.length < width) columns.push('');
    rows = rows.map((row) => { while (row.length < width) row.push(''); return row; });
    cells.forEach((line, i) => {
      const target = r + i;
      if (target === -1) { line.forEach((cell, j) => { columns[c + j] = cell; }); return; }
      while (rows.length <= target) rows.push(columns.map(() => ''));
      line.forEach((cell, j) => { rows[target][c + j] = cell; });
    });
    onChange({ columns, rows });
  };
  const onPaste = (r: number, c: number) => (e: ClipboardEvent<HTMLInputElement>) => {
    const cells = parseClipboard(e.clipboardData.getData('text/plain'));
    if (cells.length <= 1 && (cells[0]?.length ?? 0) <= 1) return;
    e.preventDefault();
    fillFrom(r, c, cells);
  };
  const applyPaste = () => {
    const cells = parseClipboard(pasteText);
    if (!cells.length) return;
    const columns = headerRow ? cells[0] : cells[0].map((_, i) => v.columns[i] ?? `Column ${i + 1}`);
    const rows = headerRow ? cells.slice(1) : cells;
    onChange(normalise({ columns, rows }));
    setPasteOpen(false);
    setPasteText('');
  };

  return (
    <FieldWrap label={label} help={help ?? 'Paste cells from a spreadsheet into any cell to fill the table from there.'} error={error}>
      <div className="overflow-x-auto border rounded-sm bg-white">
        <table className="text-sm min-w-full">
          <thead>
            <tr className="bg-muted/60">
              <th className="w-8" />
              {v.columns.map((col, c) => (
                <th key={c} className="p-1 min-w-[140px] align-top">
                  <div className="flex items-center gap-1">
                    <Input value={col} placeholder={`Column ${c + 1}`} onChange={(e) => setCol(c, e.target.value)} onPaste={onPaste(-1, c)} className="h-8 font-medium" />
                    <button type="button" aria-label="Remove column" className="text-muted-foreground hover:text-destructive" onClick={() => removeCol(c)} disabled={v.columns.length <= 1}><X className="size-3.5" /></button>
                  </div>
                </th>
              ))}
              <th className="p-1"><Button type="button" size="sm" variant="ghost" onClick={addCol} aria-label="Add column"><Columns3 className="size-4" /></Button></th>
            </tr>
          </thead>
          <tbody>
            {v.rows.map((row, r) => (
              <tr key={r} className="border-t">
                <td className="text-center text-xs text-muted-foreground font-mono">{r + 1}</td>
                {row.map((cell, c) => <td key={c} className="p-1"><Input value={cell} onChange={(e) => setCell(r, c, e.target.value)} onPaste={onPaste(r, c)} className="h-8" /></td>)}
                <td className="p-1"><button type="button" aria-label="Remove row" className="text-muted-foreground hover:text-destructive p-1" onClick={() => removeRow(r)}><X className="size-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addRow}><Plus className="size-4" /> Add row</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen(true)}><ClipboardPaste className="size-4" /> Paste whole table</Button>
        <span className="text-xs text-muted-foreground self-center">{v.rows.length} rows × {v.columns.length} columns</span>
      </div>
      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Paste a table</DialogTitle><DialogDescription>Copy the cells in Excel or Google Sheets and paste them here. Tabs separate columns, lines separate rows. This replaces the current table.</DialogDescription></DialogHeader>
          <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={12} className="font-mono text-xs" placeholder={'Code\tSize\tLength\nCSLA-6-S16\t6 mm²\t16 mm'} />
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={headerRow} onCheckedChange={(c) => setHeaderRow(c === true)} /> First line is the column headings</label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setPasteOpen(false)}>Cancel</Button><Button type="button" onClick={applyPaste} disabled={!pasteText.trim()}>Use this table</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </FieldWrap>
  );
}
