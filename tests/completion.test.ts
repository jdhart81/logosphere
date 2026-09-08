import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { append, canonical, edgeStatus, emptyArtifact, hash, id, replay, trace, type Addition, type Artifact } from '../packages/reasoning-core/src/core.js';
import { ingest } from '../packages/observation/src/extract.js';
import { LeanVerifier } from '../packages/verifier/src/index.js';
import { Runtime } from '../packages/sdk/src/index.js';
import { FileStore } from '../packages/storage/src/index.js';
import { readUtf8Bounded } from '../packages/storage/src/files.js';
import { McpSession } from '../packages/agent-runtime/src/mcp.js';
import { actor, argument, atom, node, provenance } from './helpers.js';

const capture = (text: string) => ({ text, title: 'Synthetic chain', mode: 'supplied' as const, truncated: false, capturedAt: new Date().toISOString() });
test('a two-step argument preserves and verifies every declared inference', async () => {
  const artifact = await ingest(capture('Assumption: If P, then Q.\nAssumption: If Q, then R.\nPremise: P.\nTherefore: Q.\nTherefore: R.'), actor, true);
  const graph = await replay(artifact);
  assert.equal(graph.edges.size, 2);
  const last = [...graph.nodes.values()].find(n => n.value.text === 'R.')!.value;
  const chain = trace(graph, last.id);
  assert.equal(chain.nodes.length, 5); assert.equal(chain.edges.length, 2); assert.equal(chain.assumptions.length, 2);
  for (const edgeId of graph.edges.keys()) assert.equal((await new LeanVerifier().verify(graph, edgeId)).status, 'PROVEN');
});

test('circular prose without an explicit root stays unresolved', async () => {
  const graph = await replay(await ingest(capture('Assumption: If P, then Q.\nAssumption: If Q, then P.\nTherefore: Q.\nTherefore: P.'), actor, true));
  assert.equal(graph.edges.size, 0);
  assert.ok([...graph.nodes.values()].filter(n => n.value.kind !== 'assumption').every(n => n.value.epistemic === 'UNRESOLVED'));
  assert.equal((await replay(await ingest(capture('Premise:\nAssumption:'), actor))).nodes.size, 2);
});

test('source and evidence challenges propagate through the complete downstream trace', async () => {
  let artifact = await ingest(capture('Assumption: If P, then Q.\nAssumption: If Q, then R.\nPremise: P.\nTherefore: Q.\nTherefore: R.'), actor, true);
  let graph = await replay(artifact); const sourceId = [...graph.sources.keys()][0]!;
  artifact = await append(artifact, actor, [{ type: 'challenge', value: { id: id(), targetId: sourceId, aspect: 'source', reason: 'The source is disputed.', provenance } }]);
  graph = await replay(artifact);
  for (const edgeId of graph.edges.keys()) assert.equal(edgeStatus(graph, edgeId).disputed, true);
  const downstream = [...graph.edges.values()].at(-1)!.value;
  assert.ok(trace(graph, downstream.conclusion).changeImpact.includes(sourceId));
});

test('dependency depth is bounded even for topologically ordered event history', async () => {
  const root = node(atom('P')); let parent = root.id;
  let artifact = await append(emptyArtifact(), actor, [{ type: 'node', value: root }]);
  for (let batch = 0; batch < 6; batch++) {
    const additions: Addition[] = [];
    for (let n = 0; n < 45; n++) {
      const conclusion = node(atom('P'), 'conclusion');
      additions.push({ type: 'node', value: conclusion }, { type: 'edge', value: { id: id(), premises: [parent], assumptions: [], conclusion: conclusion.id, rule: 'reiteration', provenance } });
      parent = conclusion.id;
    }
    if (batch === 5) await assert.rejects(append(artifact, actor, additions), /depth limit/);
    else artifact = await append(artifact, actor, additions);
  }
});

test('oversize artifacts and files are rejected with allocation bounds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logosphere-bounds-'));
  try {
    const file = await open(join(dir, 'large.json'), 'w');
    await file.truncate(20_000_000); await file.close();
    await assert.rejects(readUtf8Bounded(join(dir, 'large.json')), /exceeds/);
    await writeFile(join(dir, 'invalid.txt'), Buffer.from([0xff, 0xfe]));
    await assert.rejects(readUtf8Bounded(join(dir, 'invalid.txt')), /encoded data/);
    const large = { ...emptyArtifact(), padding: Array.from({ length: 40 }, () => 'x'.repeat(60_000)) };
    await assert.rejects(replay(large), /2 MB/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a complete orphan snapshot can be reconciled without partial snapshot publication', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logosphere-recovery-'));
  try {
    const store = new FileStore(dir); const a = await argument([atom('P')], atom('P'), 'reiteration');
    await store.commit(a.artifact, null);
    const next = await append(a.artifact, actor, [{ type: 'node', value: node(atom('Q')) }]);
    await writeFile(join(dir, 'snapshots', `${next.head!.slice(7)}.json`), canonical(next), { mode: 0o600 });
    await store.commit(next, a.artifact.head);
    assert.equal((await store.load()).head, next.head);
    assert.ok((await readdir(join(dir, 'snapshots'))).every(f => f.endsWith('.json')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('SDK captures assertions before queuing and MCP ignores call notifications', async () => {
  const runtime = new Runtime(actor, new LeanVerifier());
  const submitted = node(atom('P')); const text = submitted.text;
  const pending = runtime.dispatch({ action: 'ASSERT', expectedHead: null, node: submitted });
  submitted.text = 'Changed after submission'; await pending;
  assert.equal((await replay(runtime.export())).nodes.get(submitted.id)!.value.text, text);
  const session = new McpSession(runtime, () => {});
  await session.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  const before = runtime.export().head;
  assert.equal(await session.handle({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'ASSERT', arguments: { expectedHead: before, node: node(atom('Q')) } } }), undefined);
  assert.equal(runtime.export().head, before); session.close();
});

test('graph comparison includes declared attribution differences', async () => {
  const a = await argument([atom('P')], atom('P'), 'reiteration');
  const other: Artifact = structuredClone(a.artifact);
  const event = other.events[0]!; event.actor.id = 'agent:different-creator';
  const { hash: _oldHash, ...body } = event;
  event.hash = await hash(body); other.head = event.hash;
  const runtime = new Runtime(actor, new LeanVerifier(), a.artifact);
  const result = await runtime.dispatch({ action: 'COMPARE', artifact: other }) as { conflictingIds: string[] };
  assert.ok(result.conflictingIds.includes(a.conclusion.id));
});
