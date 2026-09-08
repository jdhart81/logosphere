import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { verificationServer } from '../packages/agent-runtime/src/server.js';
import { replay } from '../packages/reasoning-core/src/core.js';
import { argument, atom } from './helpers.js';

test('loopback API rejects wrong hosts, origins, tokens and oversized payloads, then checks Lean', async () => {
  const options = { token: 'a'.repeat(64), port: 0, allowedOrigin: `chrome-extension://${'a'.repeat(32)}` };
  const server = verificationServer(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  options.port = (server.address() as { port: number }).port;
  const url = `http://127.0.0.1:${options.port}/verify`;
  const a = await argument([atom('P')], atom('P'), 'reiteration');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${options.token}`, Origin: options.allowedOrigin };
  const body = JSON.stringify({ artifact: a.artifact, edgeId: a.edge.id });
  try {
    assert.equal((await fetch(url, { method: 'POST', body, headers: { ...headers, Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', body, headers: { ...headers, Origin: 'https://hostile.example' } })).status, 403);
    const hostStatus = await new Promise<number>(resolve => {
      const req = request(url, { method: 'POST', headers: { ...headers, Host: 'hostile.example' } }, res => { res.resume(); resolve(res.statusCode!); }); req.end(body);
    }); assert.equal(hostStatus, 403);
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: options.allowedOrigin, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), options.allowedOrigin);
    assert.equal((await fetch(url, { method: 'POST', body: '{}', headers })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: 'x'.repeat(2_000_001), headers })).status, 413);
    const response = await fetch(url, { method: 'POST', body, headers }); assert.equal(response.status, 200);
    const result = await response.json() as { artifact: unknown; receiptId: string }; const graph = await replay(result.artifact);
    assert.equal(graph.verifications.get(result.receiptId)!.value.status, 'PROVEN');
    assert.deepEqual(graph.artifact.events.slice(0, a.artifact.events.length), a.artifact.events);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
