// Perlengkapan tes browser fuzz: satu Chrome + satu server per berkas tes.
import { before, after } from 'node:test';
import { launch, hasChrome } from './cdp.mjs';
import { startFuzzServer } from './fuzzserve.mjs';

export const skip = !hasChrome && 'Chrome tidak ada';
export function setup(port) {
  const env = { server: null, browser: null };
  before(async () => { if (skip) return; env.server = await startFuzzServer(port); env.browser = await launch(); });
  after(async () => { if (env.browser) await env.browser.close(); if (env.server) env.server.close(); });
  return env;
}
