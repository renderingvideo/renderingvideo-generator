const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const { promisify } = require('node:util');
const { test } = require('node:test');
const run = promisify(execFile);
const script = resolve(__dirname, '../scripts/gen-preview.cjs');

async function fixture(handler, operation) {
  const directory = await mkdtemp(resolve(tmpdir(), 'rv-preview-test-'));
  const file = resolve(directory, 'schema.json');
  await writeFile(file, JSON.stringify({ meta: { version: '2.0.0', width: 1280, height: 720 }, tracks: [] }));
  const server = createServer(handler);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const invoke = (args = [], extraEnv = {}) => run(process.execPath, [script, file, '--json', ...args], {
    env: { ...process.env, RENDERINGVIDEO_VIDEO_ORIGIN: origin, RENDERINGVIDEO_API_KEY: 'sk-not-for-public', RENDERINGVIDEO_AGENT_KEY: 'ak_not_for_public', RENDERINGVIDEO_TIMEOUT_MS: '2000', ...extraEnv }, timeout: 5000,
  });
  try { await operation(invoke, origin, file); }
  finally { server.closeAllConnections(); await new Promise(done => server.close(done)); await rm(directory, { recursive: true, force: true }); }
}

test('returns real absolute player URL without inventing a viewer route or sending credentials', async () => {
  await fixture((req, res) => {
    assert.equal(req.url, '/api/preview');
    assert.equal(req.headers.authorization, undefined);
    res.end(JSON.stringify({ success: true, tempId: 'raw', url: '/t/raw', expiresIn: '3d' }));
  }, async (invoke, origin) => {
    const value = JSON.parse((await invoke()).stdout);
    assert.equal(value.url, origin + '/t/raw');
    assert.equal(value.viewerUrl, undefined);
    assert.equal(value.expiresIn, '3d');
  });
});

for (const [label, response] of [
  ['API-level failure', { success: false, error: 'Invalid schema' }],
  ['missing URL', { success: true, tempId: 'x' }],
  ['missing temp ID', { success: true, url: '/t/x' }],
  ['non-HTTP URL', { success: true, tempId: 'x', url: 'javascript:alert(1)' }],
]) test('rejects ' + label, async () => {
  await fixture((req, res) => res.end(JSON.stringify(response)), async invoke => {
    await assert.rejects(invoke(), error => error.code === 1 && error.stderr.includes('Error:'));
  });
});

test('reports malformed server JSON', async () => {
  await fixture((req, res) => res.end('<html>upstream error</html>'), async invoke => {
    await assert.rejects(invoke(), error => error.stderr.includes('invalid JSON'));
  });
});

test('rejects wrapped schemas locally and bounds stalled requests', async () => {
  let calls = 0;
  await fixture(() => { calls++; }, async (invoke, origin, file) => {
    await assert.rejects(invoke([], { RENDERINGVIDEO_TIMEOUT_MS: '30' }));
    const before = calls;
    await writeFile(file, JSON.stringify({ config: { meta: {}, tracks: [] } }));
    await assert.rejects(invoke(), error => error.stderr.includes('without a config wrapper'));
    assert.equal(calls, before);
  });
});
