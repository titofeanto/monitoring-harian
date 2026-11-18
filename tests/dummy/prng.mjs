// PRNG berbenih (mulberry32): hasil identik tiap dijalankan. Dipakai semua pembangkit data dummy.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pembungkus kecil: int(a,b) inklusif, pick, chance(p), shuffle (salinan), sub(label) untuk aliran bebas-bentrok. */
export function makeRng(seed) {
  const next = mulberry32(seed);
  const rng = {
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    chance: p => next() < p,
    shuffle(arr) {
      const x = arr.slice();
      for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
      return x;
    },
    sub(label) {
      let h = 2166136261 >>> 0;
      for (const c of String(label)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
      return makeRng((seed ^ h) >>> 0);
    },
  };
  return rng;
}
