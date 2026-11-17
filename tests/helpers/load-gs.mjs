import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Memuat Code.gs ke konteks vm dengan layanan Apps Script palsu.
export function loadGs(overrides = {}) {
  const src = fs.readFileSync(new URL('../../google-apps-script/Code.gs', import.meta.url), 'utf8');
  const store = new Map();                       // CacheService palsu
  const props = new Map(Object.entries(overrides.props || {}));
  const ctx = {
    console, Logger: { log() {} },
    CacheService: { getScriptCache: () => ({
      get: k => (store.has(k) ? store.get(k) : null),
      put: (k, v) => { store.set(k, String(v)); },
      remove: k => { store.delete(k); },
      removeAll: ks => ks.forEach(k => store.delete(k)),
      putAll: o => Object.entries(o).forEach(([k, v]) => store.set(k, String(v))),
      getAll: ks => Object.fromEntries(ks.map(k => [k, store.get(k) ?? null])),
    }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => { props.set(k, String(v)); },
    }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      sleep: ms => { ctx.__slept = (ctx.__slept || 0) + ms; },   // tidak benar-benar tidur
      base64Encode: b => Buffer.from(b).toString('base64'),
      computeDigest: (_alg, s) => [...crypto.createHash('sha256').update(s).digest()],
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      formatDate: (d, _tz, f) => d.toISOString().slice(0, 10),
    },
    ContentService: { MimeType: { JSON: 'JSON' }, createTextOutput: s => ({ getContent: () => s, setMimeType() { return this; } }) },
    SpreadsheetApp: overrides.SpreadsheetApp,
    ...overrides.globals,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'Code.gs' });
  return ctx;     // fungsi global Code.gs ada sebagai properti ctx
}
