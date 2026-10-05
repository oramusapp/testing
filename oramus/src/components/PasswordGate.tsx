import { useState, type ReactNode } from 'react';

// Access screen shown on the first visit on each device. Only the SHA-256 hash of the password is in the code.
// This is a client-side gate for a static site: it keeps casual visitors out, but the site files stay public.
const HASH = '25f9816ee1edb6078b8ae1becbfa2d8ae148f0ac2d90bd237ffb86b6d4f765f4';
const KEY = 'oramus.access';

async function sha256(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const unlocked = () => { try { return localStorage.getItem(KEY) === HASH; } catch { return false; } };

export default function PasswordGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(unlocked);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);
  if (ok) return <>{children}</>;
  const submit = async () => {
    if ((await sha256(pw)) === HASH) { try { localStorage.setItem(KEY, HASH); } catch { /* private mode: ask again next time */ } setOk(true); }
    else { setErr(true); setPw(''); }
  };
  return (
    <div className="app" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh', padding: 24 }}>
      <form style={{ width: '100%', maxWidth: 340, display: 'grid', gap: 12 }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div style={{ textAlign: 'center', letterSpacing: '.3em', fontWeight: 600 }}>ORAMUS</div>
        <div className="dim" style={{ textAlign: 'center', fontSize: 14 }}>Wpisz hasło, aby otworzyć aplikację</div>
        <input className="input" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }} placeholder="Hasło" />
        {err && <div className="red" style={{ fontSize: 13, textAlign: 'center' }}>Nieprawidłowe hasło</div>}
        <button className="btn primary block" type="submit" disabled={!pw}>Otwórz</button>
      </form>
    </div>
  );
}
