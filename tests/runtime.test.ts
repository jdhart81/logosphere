import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append, id, replay } from '../packages/reasoning-core/src/core.js';
import { DEMO } from '../packages/observation/src/extract.js';
import { FileStore } from '../packages/storage/src/index.js';
import { Runtime } from '../packages/sdk/src/index.js';
import { McpSession } from '../packages/agent-runtime/src/mcp.js';
import { LeanVerifier } from '../packages/verifier/src/index.js';
import { actor, argument, atom, node, provenance } from './helpers.js';

test('local store persists immutable snapshots, survives restart and rejects stale writers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logosphere-store-test-'));
  try {
    const store = new FileStore(dir); const a = await argument([atom('P')], atom('P'), 'reiteration');
    await store.commit(a.artifact, null); assert.deepEqual(await new FileStore(dir).load(), a.artifact);
    const next = await append(a.artifact, actor, [{ type: 'node', value: node(atom('Q')) }]);
    await store.commit(next, a.artifact.head);
    await assert.rejects(store.commit(a.artifact, a.artifact.head), /head conflict/);
    assert.equal((await readdir(join(dir, 'snapshots'))).length, 2);
    assert.deepEqual(await store.load(), next);
    const snapshot = join(dir, 'snapshots', `${next.head!.slice(7)}.json`);
    const corrupted = (await readFile(snapshot, 'utf8')).replace('Synthetic', 'Tampered'); await writeFile(snapshot, corrupted);
    await assert.rejects(store.load(), /hash chain/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('I8: humans and agents share objects, commit notifications, trace and graph-backed render', async () => {
  const runtime = new Runtime({ id: 'agent:researcher', kind: 'agent' }, new LeanVerifier());
  const notifications: unknown[] = []; const stop = runtime.subscribe(x => notifications.push(x));
  await runtime.dispatch({ action: 'OBSERVE', text: DEMO, title: 'Synthetic', acceptFormalization: true, expectedHead: null });
  let graph = await replay(runtime.export()); const edgeId = [...graph.edges.keys()][0]!;
  await runtime.dispatch({ action: 'VERIFY', edgeId, expectedHead: runtime.export().head });
  const conclusion = graph.edges.get(edgeId)!.value.conclusion;
  assert.match(JSON.stringify(await runtime.dispatch({ action: 'RENDER', nodeId: conclusion })), /PROVEN/);
  assert.match(JSON.stringify(await runtime.dispatch({ action: 'TRACE', nodeId: conclusion })), /ASSUMPTION/);
  graph = await replay(runtime.export()); const targetId = [...graph.nodes.keys()][0]!;
  await runtime.dispatch({ action: 'CHALLENGE', expectedHead: graph.artifact.head, challenge: { id: id(), targetId, aspect: 'premise', reason: 'Needs evidence', provenance } });
  assert.equal(notifications.length, 3); stop();
  assert.equal((await replay(runtime.export())).challenges.size, 1);
  const exported = runtime.export(); exported.events.length = 0; assert.ok(runtime.export().events.length > 0);
});
test('SDK serializes competing mutations and does not publish failed writes', async () => {
  const runtime = new Runtime(actor, new LeanVerifier());
  const commands = [node(atom('P')), node(atom('Q'))].map(n => runtime.dispatch({ action: 'ASSERT', node: n, expectedHead: null }));
  const outcomes = await Promise.allSettled(commands);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1); assert.equal(runtime.export().events.length, 1);
  const failing = new Runtime(actor, new LeanVerifier(), undefined, { commit: async () => { throw new Error('Disk full'); } });
  let called = false; failing.subscribe(() => { called = true; });
  await assert.rejects(failing.dispatch({ action: 'ASSERT', node: node(atom('P')), expectedHead: null }), /Disk full/);
  assert.equal(called, false); assert.equal(failing.export().head, null);
});
test('MCP initialization, tools, canonical resource, subscriptions and errors', async () => {
  const runtime = new Runtime({ id: 'agent:mcp', kind: 'agent' }, new LeanVerifier()); const notices: unknown[] = [];
  const session = new McpSession(runtime, x => notices.push(x));
  const call = (method: string, params: Record<string, unknown> = {}) => session.handle({ jsonrpc: '2.0', id: 1, method, params }) as Promise<{ result?: Record<string, unknown>; error?: { code: number } }>;
  assert.equal((await call('tools/list')).error?.code, -32602);
  assert.equal((await call('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } })).result?.protocolVersion, '2025-11-25');
  const listed = (await call('tools/list')).result?.tools as { name: string }[];
  assert.equal(listed.length, 11); assert.ok(listed.some(x => x.name === 'VERIFY'));
  await call('resources/subscribe', { uri: 'logosphere://graph' });
  const observed = await call('tools/call', { name: 'OBSERVE', _meta: { progressToken: 'client-progress-token' }, arguments: { expectedHead: null, title: 'Synthetic', text: DEMO, acceptFormalization: false } });
  assert.equal(observed.result?.isError, false); assert.equal(notices.length, 1);
  assert.doesNotMatch(JSON.stringify(runtime.export()), /client-progress-token/);
  assert.ok((await call('resources/read', { uri: 'logosphere://graph' })).result?.contents);
  assert.equal((await call('tools/call', { name: 'OBSERVE', arguments: { action: 'VERIFY' } })).result?.isError, true);
  assert.equal((await call('invented')).error?.code, -32601);
  assert.equal(await session.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
  session.close();
});
