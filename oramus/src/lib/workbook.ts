// Spreadsheet engine: ExcelJS reads/writes .xlsx (keeping styles, widths, merges),
// HyperFormula evaluates formulas live (≈400 Excel functions + a few extras below).
import ExcelJS from 'exceljs';
import { HyperFormula, FunctionPlugin, FunctionArgumentType, CellError, ErrorType, type SimpleCellAddress, type RawCellContent } from 'hyperformula';

// ---------- extra functions missing from HyperFormula ----------
function matchCriterion(crit: unknown): (v: unknown) => boolean {
  if (typeof crit === 'number' || typeof crit === 'boolean') return (v) => v === crit;
  const s = String(crit ?? '');
  const m = /^(<=|>=|<>|=|<|>)?(.*)$/.exec(s)!;
  const op = m[1] ?? '=', rhs = m[2];
  const num = rhs.trim() !== '' && !isNaN(+rhs) ? +rhs : null;
  if (num != null) {
    return (v) => {
      if (typeof v !== 'number') return op === '<>';
      return op === '=' ? v === num : op === '<>' ? v !== num : op === '<' ? v < num : op === '>' ? v > num : op === '<=' ? v <= num : v >= num;
    };
  }
  const rx = new RegExp('^' + rhs.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  return (v) => {
    const t = v == null ? '' : String(v);
    return op === '<>' ? !rx.test(t) : op === '=' ? rx.test(t) : false;
  };
}
type RangeLike = { data: unknown[][] } | unknown;
const flat = (r: RangeLike): unknown[] => {
  const d = (r as { data?: unknown[][] })?.data;
  if (Array.isArray(d)) return d.flat();
  return [r];
};

class ExtraFunctions extends FunctionPlugin {
  static implementedFunctions = {
    AVERAGEIFS: { method: 'averageifs', parameters: [{ argumentType: FunctionArgumentType.RANGE }, { argumentType: FunctionArgumentType.RANGE }, { argumentType: FunctionArgumentType.NOERROR }], repeatLastArgs: 2 },
    CONCAT: { method: 'concat', parameters: [{ argumentType: FunctionArgumentType.ANY }], repeatLastArgs: 1, expandRanges: true },
    XMATCH: { method: 'xmatch', parameters: [{ argumentType: FunctionArgumentType.NOERROR }, { argumentType: FunctionArgumentType.RANGE }, { argumentType: FunctionArgumentType.NUMBER, defaultValue: 0 }] }
  };
  averageifs(ast: any, state: any) {
    return this.runFunction(ast.args, state, this.metadata('AVERAGEIFS'), (avg: RangeLike, ...rest: unknown[]) => {
      const vals = flat(avg);
      const tests: [unknown[], (v: unknown) => boolean][] = [];
      for (let i = 0; i < rest.length; i += 2) tests.push([flat(rest[i]), matchCriterion(rest[i + 1])]);
      let s = 0, n = 0;
      vals.forEach((v, i) => { if (typeof v === 'number' && tests.every(([r, f]) => f(r[i]))) { s += v; n++; } });
      return n ? s / n : new CellError(ErrorType.DIV_BY_ZERO);
    });
  }
  concat(ast: any, state: any) {
    return this.runFunction(ast.args, state, this.metadata('CONCAT'), (...args: unknown[]) => args.map((a) => (a == null ? '' : typeof a === 'boolean' ? (a ? 'TRUE' : 'FALSE') : String(a))).join(''));
  }
  xmatch(ast: any, state: any) {
    return this.runFunction(ast.args, state, this.metadata('XMATCH'), (needle: unknown, range: RangeLike, mode: number) => {
      const vals = flat(range);
      const test = mode === 2 ? matchCriterion(needle) : (v: unknown) => (typeof v === 'string' && typeof needle === 'string' ? v.toLowerCase() === needle.toLowerCase() : v === needle);
      const i = vals.findIndex(test);
      return i >= 0 ? i + 1 : new CellError(ErrorType.NA);
    });
  }
}
let registered = false;
function ensurePlugins() {
  if (registered) return; registered = true;
  try { HyperFormula.registerFunctionPlugin(ExtraFunctions, { enGB: { AVERAGEIFS: 'AVERAGEIFS', CONCAT: 'CONCAT', XMATCH: 'XMATCH' } } as any); } catch (e) { console.warn('extra functions', e); }
}

// ---------- types ----------
export interface CellStyle { b?: boolean; i?: boolean; u?: boolean; color?: string; fill?: string; align?: string; size?: number; numFmt?: string; wrap?: boolean; }
export interface SheetMeta { name: string; colWidths: number[]; rowHeights: number[]; merges: { r0: number; c0: number; r1: number; c1: number }[]; frozen?: { rows: number; cols: number }; }
export const DEFAULT_COL = 92, DEFAULT_ROW = 30;

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const toSerial = (d: Date) => (d.getTime() - EXCEL_EPOCH) / 86400000;
const stripPrefixes = (f: string) => f.replace(/_xlfn\._xlws\.|_xlfn\.|_xlws\./g, '');

/** Applies `fn` only to the parts of a formula outside "string" and 'sheet name' literals. */
function outsideLiterals(f: string, fn: (code: string) => string) {
  return f.split(/("(?:[^"]|"")*"|'(?:[^']|'')*')/).map((part, i) => (i % 2 ? part : fn(part))).join('');
}
// HyperFormula only knows TRUE()/FALSE() as functions; Excel writes bare literals.
export const toEngineFormula = (f: string) => outsideLiterals(stripPrefixes(f), (c) => c.replace(/(^|[^A-Za-z0-9_.!])(TRUE|FALSE)(?![A-Za-z0-9_.(!])/gi, (_m, pre, w) => `${pre}${w.toUpperCase()}()`));
export const toExcelFormula = (f: string) => outsideLiterals(f, (c) => c.replace(/\b(TRUE|FALSE)\(\s*\)/gi, (_m, w) => w.toUpperCase()));

export function colName(c: number) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
export const addr = (r: number, c: number) => colName(c) + (r + 1);
function decode(a: string) {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(a.toUpperCase());
  if (!m) return null;
  let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
  return { r: +m[2] - 1, c: c - 1 };
}

function argb(c?: { argb?: string; theme?: number }) {
  if (!c?.argb || c.argb.length < 6) return undefined;
  const hex = c.argb.slice(-6);
  return '#' + hex;
}

// ---------- CSV ----------
export function parseCSV(text: string): string[][] {
  const delim = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function csvCell(s: string): RawCellContent {
  if (s.startsWith('=')) return s;
  const t = s.trim();
  if (t !== '' && /^-?\d+([.,]\d+)?$/.test(t)) return parseFloat(t.replace(',', '.'));
  return s === '' ? null : s;
}

// ---------- Book ----------
export class Book {
  hf: HyperFormula;
  wb: ExcelJS.Workbook;
  sheets: SheetMeta[] = [];
  styleCache = new Map<string, CellStyle>();
  dirty = false;

  private constructor(wb: ExcelJS.Workbook, data: Record<string, RawCellContent[][]>, metas: SheetMeta[], names: { name: string; expr: string }[]) {
    ensurePlugins();
    this.wb = wb;
    this.sheets = metas;
    this.hf = HyperFormula.buildFromSheets(data, { licenseKey: 'gpl-v3', leapYear1900: true, useArrayArithmetic: true, precisionRounding: 10, smartRounding: true, undoLimit: 100 });
    for (const n of names) { try { this.hf.addNamedExpression(n.name, n.expr); } catch { /* unsupported name */ } }
  }

  static blank() {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Arkusz1');
    return new Book(wb, { Arkusz1: [[]] }, [{ name: 'Arkusz1', colWidths: [], rowHeights: [], merges: [] }], []);
  }

  static async open(buf: ArrayBuffer, fileName: string): Promise<Book> {
    if (/\.(csv|txt)$/i.test(fileName)) {
      const rows = parseCSV(new TextDecoder().decode(buf)).map((r) => r.map(csvCell));
      const wb = new ExcelJS.Workbook();
      wb.addWorksheet('Arkusz1');
      return new Book(wb, { Arkusz1: rows }, [{ name: 'Arkusz1', colWidths: [], rowHeights: [], merges: [] }], []);
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const data: Record<string, RawCellContent[][]> = {};
    const metas: SheetMeta[] = [];
    wb.eachSheet((ws) => {
      const m: RawCellContent[][] = [];
      ws.eachRow({ includeEmpty: false }, (row, rn) => {
        row.eachCell({ includeEmpty: false }, (cell, cn) => {
          const r = rn - 1, c = cn - 1;
          (m[r] ??= [])[c] = cellToRaw(cell);
        });
      });
      for (let i = 0; i < m.length; i++) m[i] ??= [];
      data[ws.name] = m;
      const colWidths: number[] = [];
      (ws.columns ?? []).forEach((col, i) => { if (col?.width) colWidths[i] = Math.round(col.width * 7 + 10); });
      const rowHeights: number[] = [];
      ws.eachRow({ includeEmpty: true }, (row, rn) => { if (row.height) rowHeights[rn - 1] = Math.max(22, Math.round(row.height * 1.33)); });
      const merges = ((ws.model as any).merges ?? []).map((s: string) => {
        const [a, b] = s.split(':'); const A = decode(a), B = decode(b ?? a);
        return A && B ? { r0: A.r, c0: A.c, r1: B.r, c1: B.c } : null;
      }).filter(Boolean);
      const view = ws.views?.[0] as any;
      metas.push({ name: ws.name, colWidths, rowHeights, merges, frozen: view?.state === 'frozen' ? { rows: view.ySplit ?? 0, cols: view.xSplit ?? 0 } : undefined });
    });
    const names: { name: string; expr: string }[] = [];
    try {
      for (const dn of (wb.definedNames as any).model ?? []) {
        if (dn.ranges?.length === 1 && !dn.name.startsWith('_xlnm')) names.push({ name: dn.name, expr: '=' + dn.ranges[0] });
      }
    } catch { /* ignore */ }
    if (!metas.length) { wb.addWorksheet('Arkusz1'); data.Arkusz1 = [[]]; metas.push({ name: 'Arkusz1', colWidths: [], rowHeights: [], merges: [] }); }
    return new Book(wb, data, metas, names);
  }

  sheetId(i: number) { return this.hf.getSheetId(this.sheets[i].name)!; }
  ws(i: number) { return this.wb.getWorksheet(this.sheets[i].name)!; }
  dims(i: number) { const d = this.hf.getSheetDimensions(this.sheetId(i)); return { rows: d.height, cols: d.width }; }
  value(i: number, r: number, c: number) { return this.hf.getCellValue({ sheet: this.sheetId(i), row: r, col: c }); }
  raw(i: number, r: number, c: number): string {
    const a: SimpleCellAddress = { sheet: this.sheetId(i), row: r, col: c };
    const f = this.hf.getCellFormula(a);
    if (f) return toExcelFormula(f);
    const v = this.hf.getCellSerialized(a);
    return v == null ? '' : String(v);
  }

  style(i: number, r: number, c: number): CellStyle {
    const key = `${i}:${r}:${c}`;
    let s = this.styleCache.get(key);
    if (s) return s;
    const ws = this.ws(i);
    const row = (ws as any)._rows?.[r];
    const cell = row?._cells?.[c];
    if (!cell) { s = {}; this.styleCache.set(key, s); return s; }
    const st = cell.style ?? {};
    s = {
      b: st.font?.bold, i: st.font?.italic, u: !!st.font?.underline, color: argb(st.font?.color), size: st.font?.size,
      fill: st.fill?.type === 'pattern' && st.fill.pattern === 'solid' ? argb(st.fill.fgColor) : undefined,
      align: st.alignment?.horizontal, wrap: st.alignment?.wrapText, numFmt: st.numFmt
    };
    this.styleCache.set(key, s);
    return s;
  }

  setStyle(i: number, cells: { r: number; c: number }[], patch: (cell: ExcelJS.Cell) => void) {
    const ws = this.ws(i);
    cells.forEach(({ r, c }) => { patch(ws.getCell(r + 1, c + 1)); this.styleCache.delete(`${i}:${r}:${c}`); });
    this.dirty = true;
  }

  set(i: number, r: number, c: number, input: string) {
    let v: RawCellContent = input;
    const t = input.trim();
    if (t === '') v = null;
    else if (!t.startsWith('=') && /^-?\d+([.,]\d+)?(e-?\d+)?$/i.test(t)) v = parseFloat(t.replace(',', '.'));
    else if (/^-?\d+([.,]\d+)?%$/.test(t)) v = parseFloat(t.replace(',', '.')) / 100;
    else if (/^(true|false|prawda|fałsz)$/i.test(t)) v = /^(true|prawda)$/i.test(t);
    else if (t.startsWith('=')) v = toEngineFormula(t);
    this.hf.setCellContents({ sheet: this.sheetId(i), row: r, col: c }, [[v]]);
    this.dirty = true;
  }
  clear(i: number, r0: number, c0: number, r1: number, c1: number) {
    const rows = Array.from({ length: r1 - r0 + 1 }, () => new Array(c1 - c0 + 1).fill(null));
    this.hf.setCellContents({ sheet: this.sheetId(i), row: r0, col: c0 }, rows);
    this.dirty = true;
  }
  copy(i: number, r0: number, c0: number, r1: number, c1: number) {
    this.hf.copy({ start: { sheet: this.sheetId(i), row: r0, col: c0 }, end: { sheet: this.sheetId(i), row: r1, col: c1 } });
  }
  paste(i: number, r: number, c: number) { if (this.hf.isClipboardEmpty()) return false; this.hf.paste({ sheet: this.sheetId(i), row: r, col: c }); this.dirty = true; return true; }

  insertRow(i: number, r: number) { this.hf.addRows(this.sheetId(i), [r, 1]); this.ws(i).spliceRows(r + 1, 0, []); this.sheets[i].rowHeights.splice(r, 0, undefined as any); this.afterStructure(); }
  deleteRow(i: number, r: number) { this.hf.removeRows(this.sheetId(i), [r, 1]); this.ws(i).spliceRows(r + 1, 1); this.sheets[i].rowHeights.splice(r, 1); this.afterStructure(); }
  insertCol(i: number, c: number) { this.hf.addColumns(this.sheetId(i), [c, 1]); this.ws(i).spliceColumns(c + 1, 0, []); this.sheets[i].colWidths.splice(c, 0, undefined as any); this.afterStructure(); }
  deleteCol(i: number, c: number) { this.hf.removeColumns(this.sheetId(i), [c, 1]); this.ws(i).spliceColumns(c + 1, 1); this.sheets[i].colWidths.splice(c, 1); this.afterStructure(); }
  private afterStructure() { this.styleCache.clear(); this.dirty = true; }

  addSheet() {
    let k = this.sheets.length + 1; while (this.sheets.some((s) => s.name === 'Arkusz' + k)) k++;
    const name = 'Arkusz' + k;
    this.hf.addSheet(name); this.wb.addWorksheet(name);
    this.sheets.push({ name, colWidths: [], rowHeights: [], merges: [] });
    this.dirty = true;
    return this.sheets.length - 1;
  }
  renameSheet(i: number, name: string) {
    if (!name || this.sheets.some((s) => s.name === name)) return false;
    this.hf.renameSheet(this.sheetId(i), name); this.ws(i).name = name; this.sheets[i].name = name; this.dirty = true; return true;
  }
  removeSheet(i: number) {
    if (this.sheets.length < 2) return false;
    const ws = this.ws(i);
    this.hf.removeSheet(this.sheetId(i)); this.wb.removeWorksheet(ws.id); this.sheets.splice(i, 1); this.styleCache.clear(); this.dirty = true; return true;
  }
  undo() { if (this.hf.isThereSomethingToUndo()) { this.hf.undo(); this.dirty = true; return true; } return false; }
  redo() { if (this.hf.isThereSomethingToRedo()) { this.hf.redo(); this.dirty = true; return true; } return false; }

  /** Writes HyperFormula contents (formulas + cached results) back into the ExcelJS model. */
  async toXlsx(): Promise<ArrayBuffer> {
    this.sheets.forEach((meta, i) => {
      const ws = this.ws(i);
      const id = this.sheetId(i);
      const ser = this.hf.getSheetSerialized(id);
      const rows = Math.max(ser.length, ws.rowCount);
      for (let r = 0; r < rows; r++) {
        const cols = Math.max(ser[r]?.length ?? 0, ws.getRow(r + 1).cellCount);
        for (let c = 0; c < cols; c++) {
          const raw = ser[r]?.[c];
          const cell = ws.getCell(r + 1, c + 1);
          if (raw == null || raw === '') { if (cell.value != null) cell.value = null; continue; }
          if (typeof raw === 'string' && raw.startsWith('=')) {
            const v = this.hf.getCellValue({ sheet: id, row: r, col: c });
            const result = v instanceof Object ? undefined : v ?? undefined;
            cell.value = { formula: toExcelFormula(raw.slice(1)), result } as ExcelJS.CellFormulaValue;
          } else cell.value = raw as ExcelJS.CellValue;
        }
      }
      meta.colWidths.forEach((w, c) => { if (w) ws.getColumn(c + 1).width = Math.max(4, (w - 10) / 7); });
    });
    this.dirty = false;
    return (await this.wb.xlsx.writeBuffer()) as ArrayBuffer;
  }

  toCSV(i: number) {
    const id = this.sheetId(i); const { rows, cols } = this.dims(i);
    const out: string[] = [];
    for (let r = 0; r < rows; r++) {
      const line: string[] = [];
      for (let c = 0; c < cols; c++) {
        const v = this.hf.getCellValue({ sheet: id, row: r, col: c });
        const s = v == null ? '' : v instanceof Object ? String((v as any).value ?? '#ERR') : String(v);
        line.push(/[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
      }
      out.push(line.join(','));
    }
    return out.join('\n');
  }
}

function cellToRaw(cell: ExcelJS.Cell): RawCellContent {
  const v = cell.value as any;
  if (v == null) return null;
  if (cell.formula || v.formula || v.sharedFormula) {
    const f = cell.formula || v.formula;
    if (f) return '=' + toEngineFormula(f);
  }
  if (v instanceof Date) return toSerial(v);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t: any) => t.text).join('');
    if (v.text != null) return typeof v.text === 'object' && v.text.richText ? v.text.richText.map((t: any) => t.text).join('') : String(v.text);
    if (v.error) return v.error === '#N/A' ? '=NA()' : String(v.error);
    if ('result' in v) return v.result instanceof Date ? toSerial(v.result) : v.result ?? null;
    return null;
  }
  if (typeof v === 'string' && v.startsWith('=')) return "'" + v; // literal text starting with '='
  return v;
}

// ---------- display formatting ----------
const isDateFmt = (f: string) => /(^|[^"\\])(y|d|m{1,4}|h|s)/i.test(f.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')) && !/0|#/.test(f.replace(/"[^"]*"/g, ''));

export function formatValue(v: unknown, numFmt?: string): { text: string; num: boolean; err: boolean } {
  if (v == null) return { text: '', num: false, err: false };
  if (typeof v === 'object') { const e = (v as any).value ?? '#ERR'; return { text: String(e), num: false, err: true }; }
  if (typeof v === 'boolean') return { text: v ? 'PRAWDA' : 'FAŁSZ', num: false, err: false };
  if (typeof v === 'string') return { text: v, num: false, err: false };
  const n = v as number;
  const f = (numFmt ?? 'General').split(';')[n < 0 && numFmt?.includes(';') ? 1 : 0];
  if (!numFmt || /^general$/i.test(f)) {
    const a = Math.abs(n);
    const t = a !== 0 && (a >= 1e11 || a < 1e-9) ? n.toExponential(4) : String(+n.toPrecision(11));
    return { text: t.replace('.', ','), num: true, err: false };
  }
  if (isDateFmt(f)) return { text: formatDate(n, f), num: true, err: false };
  const pctMode = f.includes('%');
  const val = pctMode ? n * 100 : n;
  const dec = (/\.([0#]+)/.exec(f)?.[1].length) ?? 0;
  const thousands = /#,##|0,0/.test(f);
  const sci = /E\+/i.test(f);
  let body = sci ? Math.abs(val).toExponential(dec).replace('e', 'E') : Math.abs(val).toLocaleString('pl-PL', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: thousands });
  const neg = val < 0 && !(numFmt?.includes(';'));
  const lit = f.replace(/\[[^\]]*\]/g, '');
  const prefix = (/^(?:"([^"]*)"|([$€£¥]))/.exec(lit)?.slice(1).find(Boolean)) ?? '';
  const suffixM = /(?:"([^"]*)"|\s?([$€£¥]|zł))\s*%?$/.exec(lit);
  const suffix = (suffixM && suffixM.index > 0 ? suffixM.slice(1).find(Boolean) : '') ?? '';
  body = (neg ? '−' : '') + prefix + body + (suffix ? (suffix === 'zł' ? ' zł' : suffix) : '') + (pctMode ? '%' : '');
  return { text: body, num: true, err: false };
}

function formatDate(serial: number, f: string) {
  const ms = EXCEL_EPOCH + Math.round(serial * 86400000);
  const d = new Date(ms);
  const p = (x: number, l = 2) => String(x).padStart(l, '0');
  const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
  let s = f.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/\[[^\]]*\]/g, '');
  const hasTime = /h/i.test(s);
  s = s.replace(/yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM/gi, (tok, off: number) => {
    const t = tok.toLowerCase();
    if (t === 'yyyy') return String(d.getUTCFullYear());
    if (t === 'yy') return p(d.getUTCFullYear() % 100);
    if (t === 'mmmm' || t === 'mmm') return months[d.getUTCMonth()];
    if (t === 'mm' || t === 'm') {
      const before = s.slice(0, off).toLowerCase();
      const isMinute = hasTime && /h[^d]*$/.test(before);
      return isMinute ? p(d.getUTCMinutes()) : t === 'mm' ? p(d.getUTCMonth() + 1) : String(d.getUTCMonth() + 1);
    }
    if (t === 'dddd' || t === 'ddd') return d.toLocaleDateString('pl-PL', { weekday: t === 'dddd' ? 'long' : 'short', timeZone: 'UTC' });
    if (t === 'dd') return p(d.getUTCDate());
    if (t === 'd') return String(d.getUTCDate());
    if (t === 'hh') return p(d.getUTCHours());
    if (t === 'h') return String(d.getUTCHours());
    if (t === 'ss') return p(d.getUTCSeconds());
    if (t === 's') return String(d.getUTCSeconds());
    return '';
  });
  return s;
}

export const NUM_FORMATS = [
  { l: 'Ogólny', f: 'General' }, { l: 'Liczba 0,00', f: '0.00' }, { l: 'Tysiące 1 234,00', f: '#,##0.00' },
  { l: 'Procent 0%', f: '0%' }, { l: 'Procent 0,00%', f: '0.00%' }, { l: 'Waluta $', f: '"$"#,##0.00' },
  { l: 'Waluta zł', f: '#,##0.00 "zł"' }, { l: 'Data', f: 'yyyy-mm-dd' }, { l: 'Data i czas', f: 'yyyy-mm-dd hh:mm' }
];
