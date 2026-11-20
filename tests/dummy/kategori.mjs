// Data dummy menu Kategori (plan 034): tab GS_KAT_BULAN, GS_KAT_MINGGU, GS_KAT_PRODUK di Sheet pusat. Semua fiktif dan deterministik.
// Dibangkitkan dari deret HARIAN per (toko x brand), lalu dipotong menjadi baris bulan dan baris potongan minggu sesuai
// kontrak di docs/format-data-kategori.md. Jadi tab bulan dan tab minggu konsisten satu sama lain (hari yang sama, angka yang sama).
import { makeRng } from './prng.mjs';

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
export const isoOf = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
export const msOf = iso => { const p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); };

// Hirarki fiktif Division > Category Key > Brand.
export const HIER = [
  ['FOODS', 'Bumbu dan Saus', 'Merek Dapur A'], ['FOODS', 'Bumbu dan Saus', 'Merek Dapur B'], ['FOODS', 'Minuman', 'Merek Teh'], ['FOODS', 'Minuman', 'Merek Kopi'],
  ['HOME CARE', 'Pencuci Pakaian', 'Merek Rumah A'], ['HOME CARE', 'Pencuci Pakaian', 'Merek Rumah B'], ['HOME CARE', 'Pembersih Rumah', 'Merek Rumah C'],
  ['PERSONAL CARE', 'Perawatan Rambut', 'Merek Mandi A'], ['PERSONAL CARE', 'Perawatan Rambut', 'Merek Mandi B'], ['PERSONAL CARE', 'Perawatan Mulut', 'Merek Mandi C'], ['PERSONAL CARE', 'Sabun Mandi', 'Merek Mandi D'],
  ['BEAUTY & WELLBEING', 'Perawatan Kulit', 'Merek Cantik A'], ['BEAUTY & WELLBEING', 'Perawatan Kulit', 'Merek Cantik B'],
];
export const KAT_BULAN_HEADER = ['periode', 'dist_kode', 'outlet_kode', 'division', 'category', 'brand', 'gsv'];
export const KAT_MINGGU_HEADER = ['awal', 'akhir', 'dist_kode', 'outlet_kode', 'division', 'category', 'brand', 'gsv'];
export const KAT_PRODUK_HEADER = ['sku', 'category', 'brand', 'division'];

/** Hari Minggu terakhir pada atau sebelum tanggal ms. */
export const sundayOnOrBefore = ms => ms - new Date(ms).getUTCDay() * DAY;

/**
 * Rentang hari (ms awal..akhir inklusif) yang harus ada di tab minggu, menurut kontrak:
 * (a) awal bulan cutoff .. cutoff, (b) 91 hari terakhir, (c) awal bulan cutoff tahun lalu .. LY_END, ditambah hari setelah cutoff sampai dataUntil.
 */
export function coverageDays(cutoffMs, dataUntilMs) {
  const set = new Set();
  const add = (a, b) => { for (let d = a; d <= b; d += DAY) set.add(d); };
  const c = new Date(cutoffMs), monthStart = Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), 1);
  const lyEnd = cutoffMs - 364 * DAY, lyMonthStart = Date.UTC(c.getUTCFullYear() - 1, c.getUTCMonth(), 1);
  add(monthStart, cutoffMs); add(cutoffMs - 90 * DAY, cutoffMs); add(lyMonthStart, lyEnd);
  add(cutoffMs + DAY, dataUntilMs);
  return [...set].sort((a, b) => a - b);
}

/** Potongan minggu: run hari berurutan dalam satu minggu Senin-Minggu dan satu bulan. -> [[awalMs, akhirMs]] */
export function pieces(days) {
  const out = [];
  days.forEach(d => {
    const last = out[out.length - 1], dt = new Date(d);
    const cont = last && last[1] === d - DAY && dt.getUTCDay() !== 1 && dt.getUTCDate() !== 1;
    if (cont) last[1] = d; else out.push([d, d]);
  });
  return out;
}

/**
 * dts = [{ kode, stores:[{suffix, ch, status, monitored}] }], cat = katalog (skus), cfg = { cutoff, dataUntil } ISO.
 * -> { KAT_BULAN, KAT_MINGGU, KAT_PRODUK, meta }
 */
export function buildKategori({ seed, dts, cat, cutoff, dataUntil }) {
  const rng = makeRng(seed).sub('kategori');
  const cutMs = msOf(cutoff), untilMs = msOf(dataUntil);
  const start = Date.UTC(new Date(cutMs).getUTCFullYear() - 1, 0, 1);   // 1 Januari tahun lalu
  const nDays = Math.round((untilMs - start) / DAY) + 1;
  const monday0 = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY;   // Senin pertama yang memuat 1 Jan 2025
  const nWeeks = Math.ceil((untilMs - monday0) / (7 * DAY)) + 1;
  const stopLo = Math.round((Date.UTC(2026, 3, 1) - start) / DAY), stopHi = Math.round((Date.UTC(2026, 8, 1) - start) / DAY);
  const brandW = HIER.map(() => 0.5 + rng.next() * 1.0), brandG = HIER.map(() => -0.12 + rng.next() * 0.3);
  const SIZE = { SPM: 4.0e6, MINIS: 1.2e6, GT: 4.0e5 }, PSELL = { SPM: 0.92, MINIS: 0.75, GT: 0.5 }, PWEEK = { SPM: 0.95, MINIS: 0.8, GT: 0.55 };
  const bulan = [KAT_BULAN_HEADER.slice()], minggu = [KAT_MINGGU_HEADER.slice()];
  const covered = coverageDays(cutMs, untilMs), pcs = pieces(covered);
  const dayIdx = ms => Math.round((ms - start) / DAY);
  const months = [];   // Jan tahun lalu .. bulan penuh terakhir sebelum bulan cutoff
  const cd = new Date(cutMs), cy = cd.getUTCFullYear(), cm = cd.getUTCMonth();
  for (let y = cy - 1, m = 0; !(y === cy && m === cm);) { months.push([y, m]); if (++m === 12) { y++; m = 0; } }
  const meta = { toko: 0, seri: 0, retur: null, berhenti: 0, takPernah: 0 };
  let first = true;

  dts.forEach(dt => {
    dt.stores.forEach(s => {
      const ch = s.ch === 'SPM' ? 'SPM' : s.ch === 'MINIS' ? 'MINIS' : 'GT';
      const size = SIZE[ch] * (0.6 + rng.next() * 0.8) * (dt.kode === 'D02' ? 0.8 : 1);
      const isTutup = s.status === 'INACTIVE';
      meta.toko++;
      HIER.forEach((h, bi) => {
        const sells = rng.chance(PSELL[ch]);
        const stopsDay = rng.chance(0.12) ? rng.int(stopLo, stopHi) : -1;
        if (!sells) { meta.takPernah++; return; }
        const stop = isTutup ? dayIdx(Date.UTC(2026, 2, 1)) : stopsDay;
        if (stop >= 0 && !isTutup) meta.berhenti++;
        const val = new Array(nDays).fill(0);
        for (let w = 0; w < nWeeks; w++) {
          const wk = monday0 + w * 7 * DAY;
          const buy = rng.chance(PWEEK[ch]), dow = rng.int(0, 5), mult = 0.5 + rng.next();
          if (!buy) continue;
          const d = dayIdx(wk + dow * DAY);
          if (d < 0 || d >= nDays || (stop >= 0 && d >= stop)) continue;
          const yrs = (d / 365), seas = 1 + 0.1 * Math.sin(yrs * 2 * Math.PI + 1);
          val[d] = Math.round(size * brandW[bi] * 0.12 * seas * Math.pow(1 + brandG[bi], yrs) * mult / 100) * 100;
        }
        // Satu toko dengan retur: seri ini dikosongkan di bulan cutoff lalu diberi nilai negatif (retur lebih besar dari pembelian).
        if (first && ch === 'SPM' && bi === 2) {
          first = false;
          for (let d = dayIdx(Date.UTC(2026, 10, 1)); d < nDays; d++) val[d] = 0;
          val[dayIdx(Date.UTC(2026, 8, 15))] -= 900000;
          val[dayIdx(Date.UTC(2026, 10, 3))] = -1200000;
          meta.retur = { dist_kode: dt.kode, outlet_kode: s.suffix, brand: h[2] };
        }
        if (!val.some(v => v !== 0)) return;
        meta.seri++;
        months.forEach(([y, m]) => {
          const a = dayIdx(Date.UTC(y, m, 1)), b = dayIdx(Date.UTC(y, m + 1, 0));
          let t = 0; for (let d = a; d <= b; d++) t += val[d];
          if (t !== 0) bulan.push([y + '-' + pad(m + 1), dt.kode, s.suffix, h[0], h[1], h[2], t]);
        });
        pcs.forEach(([a, b]) => {
          let t = 0; for (let d = dayIdx(a); d <= dayIdx(b); d++) t += val[d];
          if (t !== 0) minggu.push([isoOf(a), isoOf(b), dt.kode, s.suffix, h[0], h[1], h[2], t]);
        });
      });
    });
  });

  // Pemetaan SKU -> hirarki. Dua SKU terakhir sengaja tidak dipetakan (menguji "Tanpa kategori").
  const produk = [KAT_PRODUK_HEADER.slice()];
  cat.skus.slice(0, cat.skus.length - 2).forEach(sku => {
    const list = HIER.filter(h => h[0] === sku.bu), h = list[(sku.code.charCodeAt(5) + sku.variant) % list.length] || list[0];
    produk.push([sku.code, h[1], h[2], h[0]]);
  });
  meta.tanpaPemetaan = cat.skus.slice(cat.skus.length - 2).map(x => x.code);
  return { KAT_BULAN: bulan, KAT_MINGGU: minggu, KAT_PRODUK: produk, meta };
}
