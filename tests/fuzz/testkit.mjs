// Perlengkapan tes browser fuzz: satu Chrome + satu server dipakai bersama semua kasus dalam satu berkas tes
// (tests/fuzz-browser.test.mjs mengimpor tests/fuzz/cases.*.mjs), supaya `node --test tests/` tidak membuka banyak Chrome sekaligus.
import { before, after } from 'node:test';
import { launch, hasChrome } from './cdp.mjs';
import { startFuzzServer } from './fuzzserve.mjs';

export const skip = !hasChrome && 'Chrome tidak ada';
let env = null;
export function setup(port = 8851) {
  if (env) return env;
  env = { server: null, browser: null };
  before(async () => { if (skip) return; env.server = await startFuzzServer(port); env.browser = await launch(); });
  after(async () => { if (env.browser) await env.browser.close(); if (env.server) env.server.close(); });
  return env;
}
