import { buildModel } from './sdcaModel';
self.onmessage = (e: MessageEvent) => {
  try { (self as unknown as Worker).postMessage({ ok: true, model: buildModel(e.data) }); }
  catch (err) { (self as unknown as Worker).postMessage({ ok: false, error: String(err) }); }
};
