import { useMemo, useState } from 'react';
import { Screen, Card, Row, NumInput, Sheet, toast } from '../components/ui';
import { IcPlus, IcTrash } from '../components/icons';
import { usePersisted } from '../lib/db';
import { useBtc } from '../lib/btcStore';
import { composite } from '../lib/sdcaModel';
import { backtest, curveRate } from '../lib/quant';
import { useRsps, SPLIT_SDCA } from '../lib/useRsps';
import { LEV_MAX } from '../lib/pyramid';
import { SDCA_DEFAULTS, type SdcaSettings } from './Sdca';
import { usd, pct } from '../lib/format';

// Rotation rules (research/run14.py, run15.py):
//  • sleeves SDCA 60 / RSPS 40, rebalanced only when the SDCA share leaves 50–70% (±10 p.p.), checked daily
//  • SDCA ↔ stablecoin: the accumulation/distribution curve (daily)
//  • RSPS ↔ stablecoin: gate closed → user's parking choice (stablecoin by default); LTPI < 0 → 100% stablecoin
export const BAND = 0.10;
const STABLE = 'USDT';
const MIN_TRADE_USD = 10, MIN_TRADE_FRAC = 0.01;

interface Holdings { sdca: { BTC: number; [STABLE]: number }; rsps: Record<string, number>; }
interface Portfolio { holdings: Holdings | null; history: { time: number; text: string }[]; }
interface Order { id: string; sleeve: 'SDCA' | 'RSPS' | 'Rebalans'; side: 'buy' | 'sell' | 'move'; sym: string; usd: number; units: number; why: string; }

export default function Signals() {
  const { model } = useBtc();
  const R = useRsps();
  const [sd] = usePersisted<SdcaSettings>('sdca.settings', SDCA_DEFAULTS);
  const [pf, setPf] = usePersisted<Portfolio>('portfolio', { holdings: null, history: [] });
  const [amount, setAmount] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const cfg = { ...SDCA_DEFAULTS, ...sd };

  const sdcaState = useMemo(() => {
    if (!model) return null;
    const comp = composite(model, cfg.enabled, cfg.manualRisk);
    const last = model.dates.length - 1;
    const start = Math.max(0, model.dates.findIndex((d) => d >= cfg.startDate));
    const bt = backtest(model.prices, comp.risk, cfg.curve, start, 10000);
    const price = model.prices[last];
    return { price, risk: comp.risk[last], rate: curveRate(cfg.curve, comp.risk[last]) / 100, modelBtcShare: (bt.btc * price) / bt.value, date: model.dates[last] };
  }, [model, cfg.enabled, cfg.manualRisk, cfg.curve, cfg.startDate]);

  const prices: Record<string, number> = { ...R.prices, [STABLE]: 1 };
  if (sdcaState) prices.BTC = sdcaState.price;
  const px = (sym: string) => prices[sym] ?? NaN;
  const target = R.sleeve;          // RSPS weights (fractions of the RSPS part); rest = stablecoin

  // ---------- initial plan from the amount ----------
  function plan(total: number): Holdings | null {
    if (!sdcaState) return null;
    const sdcaUsd = total * SPLIT_SDCA / 100, rspsUsd = total - sdcaUsd;
    const btcUsd = sdcaUsd * sdcaState.modelBtcShare;
    const rsps: Record<string, number> = {};
    let used = 0;
    for (const t of target) { if (Number.isFinite(px(t.sym))) { rsps[t.sym] = (rspsUsd * t.w) / px(t.sym); used += rspsUsd * t.w; } }
    rsps[STABLE] = rspsUsd - used;
    return { sdca: { BTC: btcUsd / sdcaState.price, [STABLE]: sdcaUsd - btcUsd }, rsps };
  }

  // ---------- valuation of current holdings ----------
  const H = pf.holdings;
  const val = (sym: string, units: number) => (sym === STABLE ? units : units * px(sym));
  const sdcaVal = H ? val('BTC', H.sdca.BTC) + H.sdca[STABLE] : 0;
  const rspsVal = H ? Object.entries(H.rsps).reduce((a, [k, u]) => a + (Number.isFinite(val(k, u)) ? val(k, u) : 0), 0) : 0;
  const total = sdcaVal + rspsVal;
  const sdcaShare = total ? sdcaVal / total : 0;
  const stableVal = H ? H.sdca[STABLE] + (H.rsps[STABLE] ?? 0) : 0;
  const exposure = total ? 1 - stableVal / total : 0;
  const missingPrice = H ? Object.keys(H.rsps).filter((k) => k !== STABLE && !Number.isFinite(px(k))) : [];

  // ---------- today's orders ----------
  const orders: Order[] = [];
  if (H && sdcaState) {
    const r = sdcaState.rate;
    if (r > 1e-6 && H.sdca[STABLE] > 0) {
      const u = H.sdca[STABLE] * r;
      if (u >= MIN_TRADE_USD) orders.push({ id: 'sdca', sleeve: 'SDCA', side: 'buy', sym: 'BTC', usd: u, units: u / sdcaState.price, why: `krzywa ${(r * 100).toFixed(2)}% rezerwy przy ryzyku ${sdcaState.risk.toFixed(1)}%` });
    } else if (r < -1e-6 && H.sdca.BTC > 0) {
      const units = H.sdca.BTC * -r;
      if (units * sdcaState.price >= MIN_TRADE_USD) orders.push({ id: 'sdca', sleeve: 'SDCA', side: 'sell', sym: 'BTC', usd: units * sdcaState.price, units, why: `krzywa ${(r * 100).toFixed(2)}% BTC przy ryzyku ${sdcaState.risk.toFixed(1)}%` });
    }
    if (R.scanFresh && rspsVal > 0) {
      const want: Record<string, number> = {};
      target.forEach((t) => (want[t.sym] = t.w * rspsVal));
      const syms = new Set([...Object.keys(want), ...Object.keys(H.rsps).filter((k) => k !== STABLE)]);
      for (const sym of syms) {
        const p = px(sym); if (!Number.isFinite(p)) continue;
        const have = (H.rsps[sym] ?? 0) * p, diff = (want[sym] ?? 0) - have;
        if (Math.abs(diff) < Math.max(MIN_TRADE_USD, MIN_TRADE_FRAC * rspsVal)) continue;
        orders.push({ id: 'rsps-' + sym, sleeve: 'RSPS', side: diff > 0 ? 'buy' : 'sell', sym, usd: Math.abs(diff), units: Math.abs(diff) / p,
          why: want[sym] ? `cel ${pct((want[sym] / rspsVal) * 100, 0)} części RSPS` : R.regime === 'rsps' ? 'wypadł z wyboru' : 'bramka zamknięta / LTPI' });
      }
    }
    if (total > 0 && Math.abs(sdcaShare - SPLIT_SDCA / 100) > BAND) {
      const move = Math.abs(sdcaShare - SPLIT_SDCA / 100) * total;
      orders.push({ id: 'rebal', sleeve: 'Rebalans', side: 'move', sym: STABLE, usd: move, units: move,
        why: `SDCA ${pct(sdcaShare * 100, 0)} poza pasmem 50–70%: przenieś ${usd(move, 0)} z ${sdcaShare > SPLIT_SDCA / 100 ? 'SDCA do RSPS' : 'RSPS do SDCA'}` });
    }
  }

  function execute(o: Order) {
    if (!H) return;
    const h: Holdings = { sdca: { ...H.sdca }, rsps: { ...H.rsps } };
    if (o.sleeve === 'SDCA') {
      if (o.side === 'buy') { h.sdca.BTC += o.units; h.sdca[STABLE] -= o.usd; } else { h.sdca.BTC -= o.units; h.sdca[STABLE] += o.usd; }
    } else if (o.sleeve === 'RSPS') {
      const sign = o.side === 'buy' ? 1 : -1;
      h.rsps[o.sym] = Math.max(0, (h.rsps[o.sym] ?? 0) + sign * o.units);
      h.rsps[STABLE] = (h.rsps[STABLE] ?? 0) - sign * o.usd;
      if (h.rsps[o.sym] < 1e-12) delete h.rsps[o.sym];
    } else {
      // move value between sleeves through stablecoins (sell in the overweight sleeve first)
      const fromSdca = sdcaShare > SPLIT_SDCA / 100;
      if (fromSdca) { const fromStable = Math.min(h.sdca[STABLE], o.usd); h.sdca[STABLE] -= fromStable; const rest = o.usd - fromStable; if (rest > 0) h.sdca.BTC -= rest / px('BTC'); h.rsps[STABLE] = (h.rsps[STABLE] ?? 0) + o.usd; }
      else { const fromStable = Math.min(h.rsps[STABLE] ?? 0, o.usd); h.rsps[STABLE] = (h.rsps[STABLE] ?? 0) - fromStable; h.sdca[STABLE] += o.usd; if (o.usd - fromStable > 0) toast('Brak stablecoinów w RSPS: sprzedaj część pozycji RSPS (zlecenia pojawią się po przeliczeniu)'); }
    }
    setPf({ holdings: h, history: [{ time: Date.now(), text: `${o.sleeve}: ${o.side === 'buy' ? 'kupno' : o.side === 'sell' ? 'sprzedaż' : 'przeniesienie'} ${o.sym} ${usd(o.usd, 0)}` }, ...pf.history].slice(0, 200) });
    toast('Zapisano wykonanie');
  }

  // conservative (fully correlated) portfolio volatility estimate for the exposure proposal
  const volEst = H && total ? (val('BTC', H.sdca.BTC) * (R.vols.BTC ?? 0) + Object.entries(H.rsps).reduce((a, [k, u]) => a + (k === STABLE ? 0 : (val(k, u) || 0) * (R.vols[k] ?? R.vols.BTC ?? 0)), 0)) / total : 0;

  if (!H) {
    const p = amount && amount > 0 ? plan(amount) : null;
    return (
      <Screen title="Sygnały" subtitle="Rozpisanie kapitału, codzienne zlecenia i rotacja">
        <Card className="hero">
          <div className="eyebrow">Kwota na kryptowaluty</div>
          <NumInput value={amount} onChange={setAmount} placeholder="np. 10000" suffix="USD" />
          <div className="note-text mt8">System rozpisze kwotę na SDCA {SPLIT_SDCA}% i RSPS {100 - SPLIT_SDCA}% według dzisiejszego stanu modeli (zamknięcie {sdcaState?.date ?? '—'}).</div>
        </Card>
        {p && <PlanTable h={p} px={px} />}
        {p && <button className="btn primary block" onClick={() => { setPf({ holdings: p, history: [{ time: Date.now(), text: `Start: ${usd(amount!, 0)}` }] }); toast('Portfel zapisany'); }}>Kupiłem według planu — zapisz jako mój portfel</button>}
        {!R.scanFresh && <div className="warn-box mt12">Skan RSPS nieaktualny — otwórz zakładkę RSPS lub poczekaj na skan, aby plan RSPS był aktualny.</div>}
      </Screen>
    );
  }

  return (
    <Screen title="Sygnały" subtitle={`Codziennie po zamknięciu 00:00 UTC · dane ${sdcaState?.date ?? '—'}`}>
      <Card className="hero">
        <div className="eyebrow">Mój portfel</div>
        <div className="big-number">{usd(total, 0)}</div>
        <div className="stat-grid mt12">
          <div className="stat"><div className="k">SDCA / RSPS</div><div className="v">{pct(sdcaShare * 100, 0)} / {pct((1 - sdcaShare) * 100, 0)}</div><div className="s">cel {SPLIT_SDCA}/{100 - SPLIT_SDCA}, pasmo ±10 p.p.</div></div>
          <div className="stat"><div className="k">Ekspozycja na rynek</div><div className="v">{pct(exposure * 100, 0)}</div><div className="s">stablecoin {usd(stableVal, 0)}</div></div>
        </div>
        {missingPrice.length > 0 && <div className="warn-box mt12" style={{ marginBottom: 0 }}>Brak ceny dla: {missingPrice.join(', ')} (poza skanerem). Wartość pominięta.</div>}
      </Card>

      {R.parkingPending && (
        <Card>
          <div className="between"><b>Decyzja: bramka RSPS zamknięta</b><span className="pill trim">wymaga decyzji</span></div>
          <div className="note-text mt8">Gdzie trzymać część RSPS? Domyślnie stablecoin. Backtest 2020–10.2026: stablecoin — CAGR 54%, obsunięcie −26%; BTC × trend — CAGR 73%, obsunięcie −32%.</div>
          <div className="flex mt12">
            <button className="btn small primary grow" onClick={() => R.confirmParking('stable')}>Stablecoin</button>
            <button className="btn small grow" onClick={() => R.confirmParking('btc')}>BTC × trend</button>
          </div>
        </Card>
      )}

      <div className="section-title">Dzisiejsze zlecenia</div>
      <Card className="tight">
        {orders.length === 0 && <div className="empty">Brak zleceń — portfel zgodny z sygnałem</div>}
        {orders.map((o) => (
          <div key={o.id} className="row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <div><span className={o.side === 'buy' ? 'green' : o.side === 'sell' ? 'red' : 'accent'}>{o.side === 'buy' ? 'KUP' : o.side === 'sell' ? 'SPRZEDAJ' : 'PRZENIEŚ'}</span> <b>{o.sym}</b> <span className="dim">· {o.sleeve}</span></div>
              <div className="num" style={{ fontSize: 14 }}>{usd(o.usd, 0)}{o.side !== 'move' && <span className="dim"> ≈ {o.units.toPrecision(5)} {o.sym}</span>}</div>
              <div className="faint" style={{ fontSize: 12 }}>{o.why}</div>
            </div>
            <button className="btn small" onClick={() => execute(o)}>Wykonano</button>
          </div>
        ))}
      </Card>

      {(R.gate.allowed || R.shortProposal || volEst > 0.6) && <div className="section-title">Propozycje (poza alokacją)</div>}
      {R.gate.allowed && <Card><b className="green">Dźwignia {LEV_MAX}× na BTC</b><div className="note-text mt8">Spełnione wszystkie 10 warunków. Tylko propozycja; nie wliczona w zlecenia.</div></Card>}
      {R.shortProposal && <Card><b className="red">Short altów: {R.picks.shorts.map((r) => r.sym).join(', ')}</b><div className="note-text mt8">Pełny trend spadkowy BTC. 15–30% części RSPS jako zabezpieczenie (kontrakty perpetual). Tylko propozycja.</div></Card>}
      {volEst > 0.6 && <Card><b className="amber">Wysoka zmienność portfela ≈ {pct(volEst * 100, 0)}</b><div className="note-text mt8">Szacunek ostrożny (pełna korelacja aktywów). Propozycja: zmniejszyć ekspozycję do ok. {pct(Math.min(1, 0.6 / volEst) * exposure * 100, 0)} przenosząc resztę do stablecoinów. W backteście limit zmienności portfela nie poprawiał wyników istotnie — decyzja należy do Ciebie.</div></Card>}

      <div className="section-title">Skład portfela</div>
      <Card className="tight">
        <Row label={<b>SDCA</b>} value={usd(sdcaVal, 0)} />
        <Row label="BTC" value={<span className="num">{H.sdca.BTC.toPrecision(6)} · {usd(val('BTC', H.sdca.BTC), 0)}</span>} />
        <Row label={STABLE} value={usd(H.sdca[STABLE], 0)} />
        <Row label={<b>RSPS</b>} value={usd(rspsVal, 0)} />
        {Object.entries(H.rsps).map(([k, u]) => <Row key={k} label={k} value={<span className="num">{k === STABLE ? usd(u, 0) : `${u.toPrecision(6)} · ${usd(val(k, u), 0)}`}</span>} />)}
        <div className="flex" style={{ padding: 12 }}>
          <button className="btn small grow" onClick={() => setEditOpen(true)}>Edytuj stany</button>
          <button className="btn small grow" onClick={() => setFlowOpen(true)}>Wpłata / wypłata</button>
        </div>
      </Card>

      <div className="section-title">Zasady rotacji</div>
      <Card>
        <ol className="step-list">
          <li><b>SDCA ↔ RSPS:</b> cel {SPLIT_SDCA}/{100 - SPLIT_SDCA}. Przeniesienie tylko gdy udział SDCA wyjdzie poza 50–70%, sprawdzane codziennie.</li>
          <li><b>SDCA ↔ stablecoin:</b> krzywa akumulacji/dystrybucji — dzienne kupno z rezerwy lub sprzedaż BTC do rezerwy.</li>
          <li><b>RSPS ↔ stablecoin:</b> bramka otwarta → wybrane tokeny + BTC × trend; bramka zamknięta → Twój wybór (domyślnie stablecoin); LTPI &lt; 0 → 100% stablecoin.</li>
          <li><b>Zmiana stanu przez Ciebie</b> (wpłata, wypłata, ręczna korekta) → system przelicza i pokazuje potrzebne zlecenia.</li>
        </ol>
        <div className="note-text mt8">Backtest 2020–10.2026 (research/run14–15): pasmo ±10 p.p. poprawiło Sharpe i obsunięcie względem rebalansu rocznego; średnia ekspozycja portfela ok. 62–66%, w 2022 ok. 41%.</div>
      </Card>

      {pf.history.length > 0 && <><div className="section-title">Historia</div><Card className="tight">{pf.history.slice(0, 15).map((h, i) => <Row key={i} label={h.text} value={<span className="dim">{new Date(h.time).toLocaleDateString('pl-PL')}</span>} />)}</Card></>}
      <button className="btn danger block mt12" onClick={() => { if (confirm('Usunąć zapisany portfel i zacząć od nowa?')) setPf({ holdings: null, history: [] }); }}>Zacznij od nowa</button>

      <EditSheet open={editOpen} onClose={() => setEditOpen(false)} h={H} onSave={(h) => { setPf({ holdings: h, history: [{ time: Date.now(), text: 'Ręczna korekta stanów' }, ...pf.history] }); }} />
      <FlowSheet open={flowOpen} onClose={() => setFlowOpen(false)} onSave={(amt) => {
        const h: Holdings = { sdca: { ...H.sdca }, rsps: { ...H.rsps } };
        h.sdca[STABLE] += amt * SPLIT_SDCA / 100; h.rsps[STABLE] = (h.rsps[STABLE] ?? 0) + amt * (1 - SPLIT_SDCA / 100);
        if (h.sdca[STABLE] < 0 || (h.rsps[STABLE] ?? 0) < 0) { toast('Za mało stablecoinów — najpierw sprzedaj część pozycji'); return; }
        setPf({ holdings: h, history: [{ time: Date.now(), text: `${amt >= 0 ? 'Wpłata' : 'Wypłata'} ${usd(Math.abs(amt), 0)}` }, ...pf.history] });
      }} />
    </Screen>
  );
}

function PlanTable({ h, px }: { h: Holdings; px: (s: string) => number }) {
  const rows: [string, string, number, number][] = [];
  rows.push(['SDCA', 'BTC', h.sdca.BTC * px('BTC'), h.sdca.BTC], ['SDCA', STABLE, h.sdca[STABLE], h.sdca[STABLE]]);
  Object.entries(h.rsps).forEach(([k, u]) => rows.push(['RSPS', k, k === STABLE ? u : u * px(k), u]));
  const tot = rows.reduce((a, r) => a + r[2], 0);
  return (
    <Card className="tight">
      <table className="data">
        <thead><tr><th style={{ paddingLeft: 16 }}>Część</th><th>Aktywo</th><th>%</th><th>USD</th><th style={{ paddingRight: 16 }}>Ilość</th></tr></thead>
        <tbody>{rows.filter((r) => r[2] > 0.5).map((r) => <tr key={r[0] + r[1]}><td style={{ paddingLeft: 16 }}>{r[0]}</td><td><b>{r[1]}</b></td><td>{pct((r[2] / tot) * 100, 1)}</td><td>{usd(r[2], 0)}</td><td style={{ paddingRight: 16 }}>{r[1] === STABLE ? '—' : r[3].toPrecision(5)}</td></tr>)}</tbody>
      </table>
      <div className="note-text" style={{ padding: '8px 16px 14px' }}>SDCA wchodzi w bieżący stan modelu (udział BTC jak w backteście SDCA). RSPS według dzisiejszego sygnału; reszta w stablecoinach.</div>
    </Card>
  );
}

function EditSheet({ open, onClose, h, onSave }: { open: boolean; onClose: () => void; h: Holdings; onSave: (h: Holdings) => void }) {
  const [d, setD] = useState<Holdings>(h);
  const [sym, setSym] = useState('');
  if (!open) return null;
  const setR = (k: string, v: number | null) => setD({ ...d, rsps: { ...d.rsps, [k]: v ?? 0 } });
  return (
    <Sheet open={open} onClose={onClose} title="Stany portfela" right={<button className="text-btn" onClick={() => { onSave(d); onClose(); toast('Zapisano'); }}>Zapisz</button>}>
      <div className="section-title">SDCA</div>
      <Card className="tight">
        <Row label="BTC (ilość)" value={<NumInput className="inline-input" value={d.sdca.BTC} onChange={(v) => setD({ ...d, sdca: { ...d.sdca, BTC: v ?? 0 } })} />} />
        <Row label={`${STABLE} (USD)`} value={<NumInput className="inline-input" value={d.sdca[STABLE]} onChange={(v) => setD({ ...d, sdca: { ...d.sdca, [STABLE]: v ?? 0 } })} />} />
      </Card>
      <div className="section-title">RSPS</div>
      <Card className="tight">
        {Object.entries(d.rsps).map(([k, u]) => (
          <div key={k} className="row"><span>{k}{k === STABLE ? ' (USD)' : ''}</span><span className="flex"><NumInput className="inline-input" value={u} onChange={(v) => setR(k, v)} />
            {k !== STABLE && <button className="icon-btn plain" onClick={() => { const r = { ...d.rsps }; delete r[k]; setD({ ...d, rsps: r }); }}><IcTrash width={17} /></button>}</span></div>
        ))}
        <div className="flex" style={{ padding: 12 }}><input className="input" placeholder="Dodaj token, np. ETH" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} autoCapitalize="characters" />
          <button className="btn primary" onClick={() => { if (sym) { setR(sym, d.rsps[sym] ?? 0); setSym(''); } }}><IcPlus width={18} /></button></div>
      </Card>
      <div className="note-text">Wpisz ilości z giełdy/portfela. Po zapisaniu system przeliczy zlecenia rotacji.</div>
    </Sheet>
  );
}

function FlowSheet({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (amt: number) => void }) {
  const [amt, setAmt] = useState<number | null>(null);
  const [side, setSide] = useState<'in' | 'out'>('in');
  return (
    <Sheet open={open} onClose={onClose} title="Wpłata / wypłata">
      <div className="flex mb12">
        <button className="btn small grow" style={side === 'in' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setSide('in')}>Wpłata</button>
        <button className="btn small grow" style={side === 'out' ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined} onClick={() => setSide('out')}>Wypłata</button>
      </div>
      <div className="field"><label>Kwota (USD)</label><NumInput value={amt} onChange={setAmt} /></div>
      <div className="note-text mb12">Kwota trafia do stablecoinów w proporcji {SPLIT_SDCA}/{100 - SPLIT_SDCA}. Zlecenia kupna pojawią się według sygnałów.</div>
      <button className="btn primary block" onClick={() => { if (amt && amt > 0) { onSave(side === 'in' ? amt : -amt); setAmt(null); onClose(); } }}>Zapisz</button>
    </Sheet>
  );
}
