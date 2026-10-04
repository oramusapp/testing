import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Screen({ title, subtitle, actions, children, flush }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = ref.current!;
    const fn = () => setScrolled(el.scrollTop > 40);
    el.addEventListener('scroll', fn, { passive: true });
    return () => el.removeEventListener('scroll', fn);
  }, []);
  return (
    <div className={'screen' + (flush ? ' flush' : '')} ref={ref}>
      <div className={'topbar' + (scrolled ? ' scrolled' : '')}>
        <div className="small-title">{title}</div>
        <div className="actions">{actions}</div>
      </div>
      <div className={flush ? 'pad' : ''}>
        <h1 className="large-title">{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

export const Card = ({ children, className = '', title }: { children: ReactNode; className?: string; title?: ReactNode }) => (
  <div className={'card ' + className}>{title && <div className="eyebrow">{title}</div>}{children}</div>
);

export const Row = ({ label, value, className = '', onClick }: { label: ReactNode; value?: ReactNode; className?: string; onClick?: () => void }) => (
  <div className={'row ' + className + (onClick ? ' tap' : '')} onClick={onClick}><span className="label">{label}</span><span className="value">{value}</span></div>
);

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: ReactNode }[]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map((o) => <button key={o.v} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>{o.l}</button>)}</div>;
}

export const Switch = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="switch"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span /></label>
);

export function Sheet({ open, onClose, title, children, right }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  if (!open) return null;
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog">
        <div className="grabber" />
        <div className="sheet-head"><button className="text-btn" onClick={onClose}>Zamknij</button><h3>{title}</h3><div style={{ minWidth: 60, textAlign: 'right' }}>{right}</div></div>
        {children}
      </div>
    </>
  );
}

/** Numeric input that commits on blur/enter, accepts comma decimals. */
export function NumInput({ value, onChange, className = 'input', step, placeholder, suffix }: { value: number | null; onChange: (v: number | null) => void; className?: string; step?: number; placeholder?: string; suffix?: string }) {
  const [txt, setTxt] = useState(value == null || !Number.isFinite(value) ? '' : String(value));
  useEffect(() => { setTxt(value == null || !Number.isFinite(value) ? '' : String(value)); }, [value]);
  const commit = () => {
    const t = txt.replace(',', '.').replace(/\s/g, '');
    if (t === '') return onChange(null);
    const n = parseFloat(t);
    if (Number.isFinite(n)) onChange(n); else setTxt(value == null ? '' : String(value));
  };
  return (
    <span className="flex" style={{ gap: 4 }}>
      <input className={className} inputMode="decimal" value={txt} step={step} placeholder={placeholder}
        onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      {suffix && <span className="dim">{suffix}</span>}
    </span>
  );
}

let toastFn: ((m: string) => void) | null = null;
export const toast = (m: string) => toastFn?.(m);
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    toastFn = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), 2600); };
    return () => { toastFn = null; };
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}

/** Shares a file through the iOS share sheet, falling back to a download. */
export async function shareFile(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: name }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const haptic = () => { try { navigator.vibrate?.(8); } catch { /* iOS ignores */ } };
