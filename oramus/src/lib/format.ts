export const usd = (v: number, d = 2) => Number.isFinite(v) ? (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
export const usdShort = (v: number) => {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(1) + 'K' : a >= 1 ? a.toFixed(2) : a.toPrecision(3);
  return (v < 0 ? '−$' : '$') + s;
};
export const pct = (v: number, d = 1, sign = false) => Number.isFinite(v) ? (sign && v > 0 ? '+' : '') + v.toFixed(d) + '%' : '—';
export const signed = (v: number, d = 2) => Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(d) : '—';
export const fmtDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
