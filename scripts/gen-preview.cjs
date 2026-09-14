#!/usr/bin/env node
const fs = require('node:fs');

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const filename = args.find((arg) => arg !== '--json');
  if (filename === '--help' || filename === '-h') {
    console.log('Usage: node scripts/gen-preview.cjs <schema.json> [--json]\nEnvironment: RENDERINGVIDEO_VIDEO_ORIGIN, RENDERINGVIDEO_TIMEOUT_MS');
    return;
  }
  if (!filename) throw new Error('A schema JSON file is required.');
  const schema = JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  if (!schema || typeof schema.meta !== 'object' || !schema.meta || !Array.isArray(schema.tracks)) {
    throw new Error('Send the full schema with meta and tracks, without a config wrapper.');
  }
  const origin = new URL(process.env.RENDERINGVIDEO_VIDEO_ORIGIN || 'https://video.renderingvideo.com');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
    origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Video origin must be an HTTP(S) origin.');
  const timeout = Number(process.env.RENDERINGVIDEO_TIMEOUT_MS || 90000);
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Timeout must be positive.');
  const response = await fetch(new URL('/api/preview', origin), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeout),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(schema),
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); }
  catch { throw new Error(`HTTP ${response.status}: preview service returned invalid JSON`); }
  if (!response.ok || result?.success === false) {
    throw new Error(`HTTP ${response.status}: ${result?.error || result?.message || 'Preview request failed'}`);
  }
  if (!result || typeof result !== 'object' || !result.tempId) throw new Error('Preview response is missing tempId.');
  for (const field of ['viewerUrl', 'previewUrl', 'playerUrl', 'url']) {
    if (typeof result[field] === 'string' && result[field]) {
      const url = new URL(result[field], origin);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Invalid ${field} in preview response.`);
      result[field] = url.href;
    }
  }
  const previewUrl = result.viewerUrl || result.previewUrl || result.url || result.playerUrl;
  if (!previewUrl) throw new Error('Preview response contains no usable URL.');
  if (jsonOutput) console.log(JSON.stringify(result));
  else {
    console.log(`Temp ID: ${result.tempId}\nPreview URL: ${previewUrl}`);
    if (result.playerUrl || result.url) console.log(`Player URL: ${result.playerUrl || result.url}`);
    if (result.expiresIn) console.log(`Expires: ${result.expiresIn}`);
  }
}

main().catch((error) => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
