import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { Book, formatValue } from './workbook';

async function sample() {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Dane');
  a.getCell('A1').value = 'Produkt'; a.getCell('B1').value = 'Cena'; a.getCell('C1').value = 'Ilość'; a.getCell('D1').value = 'Wartość';
  const rows = [['A', 10, 3], ['B', 20, 1], ['A', 5, 4]];
  rows.forEach((r, i) => { a.getRow(i + 2).values = r; });
  a.getCell('D2').value = { formula: 'B2*C2', result: 30, shareType: 'shared', ref: 'D2:D4' } as any;
  a.getCell('D3').value = { sharedFormula: 'D2', result: 20 } as any;
  a.getCell('D4').value = { sharedFormula: 'D2', result: 20 } as any;
  a.getCell('D5').value = { formula: 'SUM(D2:D4)', result: 70 };
  a.getCell('E1').value = new Date(Date.UTC(2026, 0, 15)); a.getCell('E1').numFmt = 'yyyy-mm-dd';
  a.getCell('B1').font = { bold: true };
  const s = wb.addWorksheet('Raport');
  s.getCell('A1').value = { formula: "Dane!D5*2", result: 140 };
  s.getCell('A2').value = { formula: '_xlfn.XLOOKUP("B",Dane!A2:A4,Dane!B2:B4)', result: 20 };
  s.getCell('A3').value = { formula: 'AVERAGEIFS(Dane!B2:B4,Dane!A2:A4,"A")', result: 7.5 };
  s.getCell('A4').value = { formula: 'CONCAT(Dane!A2:A4)', result: 'ABA' };
  s.getCell('A5').value = { formula: 'IFERROR(1/0,"x")', result: 'x' };
  s.getCell('A6').value = { formula: 'SUMIFS(Dane!D2:D4,Dane!A2:A4,"A")', result: 50 };
  s.getCell('A7').value = { formula: 'TEXT(Dane!E1,"yyyy")', result: '2026' };
  s.getCell('A8').value = { formula: 'VLOOKUP("B",Dane!A2:C4,3,FALSE)', result: 1 };
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe('workbook', () => {
  it('loads xlsx, evaluates formulas, edits, round-trips', async () => {
    const book = await Book.open(await sample(), 't.xlsx');
    const v = (s: number, a: string) => { const m = /([A-Z]+)(\d+)/.exec(a)!; return book.value(s, +m[2] - 1, m[1].charCodeAt(0) - 65); };
    expect(v(0, 'D3')).toBe(20);
    expect(v(0, 'D4')).toBe(20);
    expect(v(0, 'D5')).toBe(70);
    expect(v(1, 'A1')).toBe(140);
    expect(v(1, 'A2')).toBe(20);
    expect(v(1, 'A3')).toBe(7.5);
    expect(v(1, 'A4')).toBe('ABA');
    expect(v(1, 'A5')).toBe('x');
    expect(v(1, 'A6')).toBe(50);
    expect(v(1, 'A7')).toBe('2026');
    expect(v(1, 'A8')).toBe(1);
    expect(book.raw(0, 2, 3)).toBe('=B3*C3');
    expect(formatValue(v(0, 'E1'), book.style(0, 0, 4).numFmt).text).toBe('2026-01-15');
    expect(book.style(0, 0, 1).b).toBe(true);
    // edit propagates
    book.set(0, 1, 1, '100');
    expect(v(0, 'D5')).toBe(340);
    expect(v(1, 'A1')).toBe(680);
    book.insertRow(0, 1);
    expect(book.raw(0, 5, 3)).toBe('=SUM(D3:D5)');
    expect(book.value(1, 0, 0)).toBe(680);
    const out = await book.toXlsx();
    const again = await Book.open(out, 'x.xlsx');
    expect(again.value(1, 0, 0)).toBe(680);
    expect(again.style(0, 0, 1).b).toBe(true);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out);
    expect((wb.getWorksheet('Raport')!.getCell('A1').value as any).formula).toBe('Dane!D6*2');
  });
  it('formats numbers', () => {
    expect(formatValue(1234.5, '#,##0.00').text).toMatch(/1\s?234,50/);
    expect(formatValue(0.256, '0.0%').text).toBe('25,6%');
    expect(formatValue(3, undefined).text).toBe('3');
  });
  it('csv', async () => {
    const b = await Book.open(new TextEncoder().encode('a;b\n1;2\n=A2+B2;x').buffer as ArrayBuffer, 'x.csv');
    expect(b.value(0, 2, 0)).toBe(3);
  });
});
