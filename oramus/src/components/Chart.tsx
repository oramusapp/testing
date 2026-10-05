// Lightweight canvas time-series chart: log/linear left axis, optional 0–100 right
// axis, band fills, per-index background shading and a touch crosshair.
import { useEffect, useRef, useState } from 'react';

export interface LineSpec {
  values: number[];
  color: string | ((v: number, i: number) => string);
  width?: number;
  axis?: 'left' | 'right';
  dash?: number[];
}
export interface BandSpec { lo: number[]; hi: number[]; color: string; }
export interface ChartProps {
  labels: string[]; // ISO dates
  lines: LineSpec[];
  bands?: BandSpec[];
  shade?: (i: number) => string | null;
  log?: boolean;
  right?: { min: number; max: number; ticks?: number[]; zones?: { from: number; to: number; color: string }[] };
  height?: number;
  fmtLeft?: (v: number) => string;
  tip?: (i: number) => string;
  markers?: { i: number; value: number; color: string }[];
}

function css(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export function Chart(p: ChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const H = p.height ?? 240;
  const pad = { l: 6, r: p.right ? 34 : 6, t: 10, b: 20 };
  const leftAxisW = 44;

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(wrap.current!);
    return () => ro.disconnect();
  }, []);

  const n = p.labels.length;
  const left = p.lines.filter((l) => (l.axis ?? 'left') === 'left');
  let lo = Infinity, hi = -Infinity;
  const consider = (v: number) => { if (Number.isFinite(v) && (!p.log || v > 0)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
  left.forEach((l) => l.values.forEach(consider));
  p.bands?.forEach((b) => { b.lo.forEach(consider); b.hi.forEach(consider); });
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (lo === hi) { hi = lo + 1; }
  const tr = p.log ? Math.log10 : (v: number) => v;
  const L0 = tr(lo), L1 = tr(hi);
  const x0 = pad.l + leftAxisW, x1 = Math.max(x0 + 10, w - pad.r);
  const y0 = pad.t, y1 = H - pad.b;
  const X = (i: number) => x0 + (n <= 1 ? 0 : (i / (n - 1)) * (x1 - x0));
  const Y = (v: number) => y1 - ((tr(v) - L0) / (L1 - L0 || 1)) * (y1 - y0);
  const YR = (v: number) => (p.right ? y1 - ((v - p.right.min) / (p.right.max - p.right.min)) * (y1 - y0) : 0);

  useEffect(() => {
    const c = cv.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr; c.height = H * dpr; c.style.height = H + 'px';
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, H);
    const line = css('--line'), dim = css('--faint');
    g.font = '10px -apple-system, system-ui, sans-serif';

    // background shading
    if (p.shade) {
      // merge runs of equal colour into one rect so translucent fills don't stack up
      let runStart = 0, runCol = n ? p.shade(0) : null;
      for (let i = 1; i <= n; i++) {
        const col = i < n ? p.shade(i) : '__end';
        if (col !== runCol) {
          if (runCol) { const a = runStart === 0 ? X(0) : (X(runStart - 1) + X(runStart)) / 2, b = i >= n ? X(n - 1) : (X(i - 1) + X(i)) / 2; g.fillStyle = runCol; g.fillRect(a, y0, Math.max(b - a, 0.6), y1 - y0); }
          runStart = i; runCol = col === '__end' ? null : col;
        }
      }
    }
    p.right?.zones?.forEach((z) => { g.fillStyle = z.color; g.fillRect(x0, YR(z.to), x1 - x0, YR(z.from) - YR(z.to)); });

    // grid + left axis labels
    g.strokeStyle = line; g.lineWidth = 0.5; g.fillStyle = dim; g.textAlign = 'right'; g.textBaseline = 'middle';
    const ticks: number[] = [];
    if (p.log) { for (let e = Math.floor(L0); e <= Math.ceil(L1); e++) if (e >= L0 - 1e-9 && e <= L1 + 1e-9) ticks.push(10 ** e); if (ticks.length < 2) ticks.push(lo, hi); }
    else { const s = niceStep((hi - lo) / 4); for (let v = Math.ceil(lo / s) * s; v <= hi; v += s) ticks.push(v); }
    ticks.forEach((v) => { const y = Y(v); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.fillText((p.fmtLeft ?? short)(v), x0 - 6, y); });
    if (p.right) {
      g.textAlign = 'left';
      (p.right.ticks ?? [0, 25, 50, 75, 100]).forEach((v) => { const y = YR(v); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.setLineDash([]); g.fillText(v + '%', x1 + 5, y); });
    }
    // x axis years
    g.textAlign = 'center'; g.textBaseline = 'top';
    // year ticks for long ranges, month ticks (MM.YY) for ranges under ~2 years
    const monthly = n < 730;
    let lastKey = '', lastX = -100;
    for (let i = 0; i < n; i++) {
      const key = monthly ? p.labels[i].slice(0, 7) : p.labels[i].slice(0, 4);
      if (key !== lastKey) {
        lastKey = key; const x = X(i);
        const text = monthly ? `${p.labels[i].slice(5, 7)}.${p.labels[i].slice(2, 4)}` : key;
        if (x - lastX > 38) { g.fillText(text, x, y1 + 5); lastX = x; }
      }
    }

    // bands
    p.bands?.forEach((b) => {
      g.fillStyle = b.color; g.beginPath();
      for (let i = 0; i < n; i++) i ? g.lineTo(X(i), Y(b.hi[i])) : g.moveTo(X(i), Y(b.hi[i]));
      for (let i = n - 1; i >= 0; i--) g.lineTo(X(i), Y(b.lo[i]));
      g.closePath(); g.fill();
    });

    // lines (decimated to ~2 points per pixel)
    const stride = Math.max(1, Math.floor(n / ((x1 - x0) * 2)));
    p.lines.forEach((l) => {
      const ys = (l.axis ?? 'left') === 'left' ? Y : YR;
      g.lineWidth = l.width ?? 1.4; g.setLineDash(l.dash ?? []); g.lineJoin = 'round';
      if (typeof l.color === 'string') {
        g.strokeStyle = l.color; g.beginPath(); let on = false;
        for (let i = 0; i < n; i += stride) {
          const v = l.values[i];
          if (!Number.isFinite(v) || (p.log && (l.axis ?? 'left') === 'left' && v <= 0)) { on = false; continue; }
          on ? g.lineTo(X(i), ys(v)) : g.moveTo(X(i), ys(v)); on = true;
        }
        g.stroke();
      } else {
        for (let i = stride; i < n; i += stride) {
          const a = l.values[i - stride], b = l.values[i];
          if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
          g.strokeStyle = l.color(b, i); g.beginPath(); g.moveTo(X(i - stride), ys(a)); g.lineTo(X(i), ys(b)); g.stroke();
        }
      }
      g.setLineDash([]);
    });
    p.markers?.forEach((m) => { g.fillStyle = m.color; g.strokeStyle = css('--bg'); g.lineWidth = 2; g.beginPath(); g.arc(X(m.i), Y(m.value), 4.5, 0, Math.PI * 2); g.fill(); g.stroke(); });

    if (hover != null) {
      g.strokeStyle = css('--accent'); g.lineWidth = 1; g.beginPath(); g.moveTo(X(hover), y0); g.lineTo(X(hover), y1); g.stroke();
    }
  });

  const pick = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const i = Math.round(((clientX - r.left - x0) / (x1 - x0)) * (n - 1));
    setHover(Math.min(Math.max(i, 0), n - 1));
  };
  return (
    <div className="chart-wrap" ref={wrap}
      onTouchStart={(e) => pick(e.touches[0].clientX)} onTouchMove={(e) => pick(e.touches[0].clientX)} onTouchEnd={() => setHover(null)}
      onMouseMove={(e) => pick(e.clientX)} onMouseLeave={() => setHover(null)}>
      <canvas ref={cv} />
      {hover != null && p.tip && <div className="chart-tip">{p.tip(hover)}</div>}
    </div>
  );
}

function niceStep(raw: number) {
  const e = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / e;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
}
function short(v: number) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(0) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(0) + 'k';
  if (a >= 1) return v.toFixed(0);
  return v.toPrecision(1);
}

/** Draggable accumulation/distribution curve editor (21 nodes, −10…+10 %/day by default). */
export function CurveEditor({ curve, onChange, current, yMax = 10 }: { curve: number[]; onChange: (c: number[]) => void; current?: number; yMax?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const W = 340, H = 220, l = 34, r = 16, t = 10, b = 22;
  const X = (i: number) => l + (i / 20) * (W - l - r);
  const Y = (v: number) => t + ((yMax - v) / (2 * yMax)) * (H - t - b);
  const fromY = (py: number) => Math.round((yMax - ((py - t) / (H - t - b)) * 2 * yMax) * 2) / 2;
  const move = (clientX: number, clientY: number, start = false) => {
    const box = ref.current!.getBoundingClientRect();
    const sx = ((clientX - box.left) / box.width) * W, sy = ((clientY - box.top) / box.height) * H;
    if (start) drag.current = Math.min(20, Math.max(0, Math.round(((sx - l) / (W - l - r)) * 20)));
    if (drag.current == null) return;
    const v = Math.min(yMax, Math.max(-yMax, fromY(sy)));
    if (curve[drag.current] !== v) { const c = [...curve]; c[drag.current] = v; onChange(c); }
  };
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="curve-editor" style={{ width: '100%', height: 'auto' }}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX, e.clientY, true); }}
      onPointerMove={(e) => move(e.clientX, e.clientY)} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
      <rect x={l} y={t} width={W - l - r} height={Y(0) - t} fill="var(--green-soft)" />
      <rect x={l} y={Y(0)} width={W - l - r} height={H - b - Y(0)} fill="var(--red-soft)" />
      {[yMax, yMax / 2, 0, -yMax / 2, -yMax].map((v) => (
        <g key={v}><line x1={l} x2={W - r} y1={Y(v)} y2={Y(v)} stroke="var(--line-strong)" strokeWidth={v === 0 ? 1 : 0.5} />
          <text x={l - 5} y={Y(v) + 3} fontSize="9" textAnchor="end" fill="var(--faint)">{(v > 0 ? '+' : '') + v}%</text></g>
      ))}
      {[0, 25, 50, 75, 100].map((v) => <text key={v} x={X(v / 5)} y={H - 6} fontSize="9" textAnchor="middle" fill="var(--faint)">{v}%</text>)}
      {current != null && Number.isFinite(current) && <line x1={X(current / 5)} x2={X(current / 5)} y1={t} y2={H - b} stroke="var(--accent)" strokeDasharray="3 3" />}
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={curve.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} />
      {curve.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r="5.5" fill={v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--dim)'} stroke="var(--bg)" strokeWidth="1.5" />)}
    </svg>
  );
}
