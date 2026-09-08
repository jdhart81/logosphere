import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('real MCP stdio process emits only JSON-RPC and persists a caller-supplied graph', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logosphere-mcp-test-'));
  try {
    const child = spawn(process.execPath, [resolve('dist/packages/agent-runtime/src/mcp.js')], { env: { ...process.env, LOGOSPHERE_STORE: dir }, stdio: ['pipe', 'pipe', 'pipe'] });
    const messages = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'OBSERVE', arguments: { expectedHead: null, text: 'A supplied, unresolved claim.', title: 'Synthetic', acceptFormalization: false } } },
      { jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'logosphere://graph' } },
    ];
    let stdout = ''; let stderr = ''; child.stdout.on('data', data => { stdout += String(data); }); child.stderr.on('data', data => { stderr += String(data); });
    const done = new Promise<number | null>((resolveExit, reject) => { child.once('error', reject); child.once('close', resolveExit); });
    child.stdin.end(messages.map(x => JSON.stringify(x)).join('\n') + '\n');
    assert.equal(await done, 0, stderr); assert.equal(stderr, '');
    const replies = stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(replies.length, 3); assert.ok(replies.every(x => x.jsonrpc === '2.0'));
    assert.equal(replies[1].result.isError, false);
    assert.ok(JSON.parse(replies[2].result.contents[0].text).head);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
