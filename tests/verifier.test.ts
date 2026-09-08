import test from 'node:test';
import assert from 'node:assert/strict';
import { append, edgeStatus, hash, replay } from '../packages/reasoning-core/src/core.js';
import { generate, LeanVerifier, reproduce, TOOLCHAIN } from '../packages/verifier/src/index.js';
import { DEMO, ingest } from '../packages/observation/src/extract.js';
import { actor, and, argument, atom, implies, not } from './helpers.js';

test('I4/I7: actual Lean proves the deduction, preserves uncertainty and independently reproduces the receipt', async () => {
  let artifact = await ingest({ text: DEMO, title: 'Synthetic', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() }, actor, true);
  const graph = await replay(artifact); const edgeId = [...graph.edges.keys()][0]!;
  const receipt = await new LeanVerifier().verify(graph, edgeId);
  assert.equal(receipt.status, 'PROVEN', receipt.stdout + receipt.stderr); assert.equal(receipt.toolchain, TOOLCHAIN); assert.deepEqual(receipt.axioms, []);
  assert.match(receipt.source, /theorem logosphere_check/); assert.doesNotMatch(receipt.source, /sensor|reservoir|sorry|axiom /);
  artifact = await append(artifact, actor, [{ type: 'verification', value: receipt }]); const result = await replay(artifact);
  assert.equal(edgeStatus(result, edgeId).formal, 'UNVERIFIED'); assert.equal(edgeStatus(result, edgeId).reported, 'PROVEN');
  assert.equal(edgeStatus(result, edgeId, new Set([receipt.id])).formal, 'PROVEN');
  assert.deepEqual([...result.nodes.values()], [...graph.nodes.values()]); assert.equal(result.evidence.size, 0);
  assert.equal((await reproduce(result, receipt.id)).matches, true);
});
test('invalid modus ponens and unavailable verifier are UNVERIFIED, not REFUTED', async () => {
  const a = await argument([implies(atom('P'), atom('Q')), atom('Q')], atom('P'));
  const graph = await replay(a.artifact);
  const receipt = await new LeanVerifier().verify(graph, a.edge.id);
  assert.equal(receipt.status, 'UNVERIFIED'); assert.notEqual(receipt.exitCode, 0);
  const unavailable = await new LeanVerifier({ executable: '/nonexistent/logosphere-lean' }).verify(graph, a.edge.id);
  assert.equal(unavailable.status, 'UNVERIFIED'); assert.match(unavailable.reason, /unavailable/);
  const timeout = await new LeanVerifier({ timeoutMs: 1 }).verify(graph, a.edge.id);
  assert.equal(timeout.status, 'UNVERIFIED');
});
test('REFUTED requires a real Lean proof of the negated conclusion', async () => {
  const a = await argument([not(atom('P'))], atom('P'), 'reiteration');
  const receipt = await new LeanVerifier().verify(await replay(a.artifact), a.edge.id);
  assert.equal(receipt.status, 'REFUTED', receipt.stdout + receipt.stderr); assert.equal(receipt.exitCode, 0);
  assert.match(receipt.source, /: \(Not v0\) :=/);
});
test('all supported fixed rule templates compile in actual Lean', async () => {
  const p = atom('P'); const q = atom('Q');
  for (const [inputs, output, rule] of [
    [[p, q], and(p, q), 'and_intro'], [[and(p, q)], p, 'and_left'], [[and(p, q)], q, 'and_right'], [[p], p, 'reiteration'],
  ] as const) {
    const a = await argument([...inputs], output, rule); const receipt = await new LeanVerifier().verify(await replay(a.artifact), a.edge.id);
    assert.equal(receipt.status, 'PROVEN', `${rule}: ${receipt.stdout}${receipt.stderr}`);
  }
});
test('proposed mappings and unsupported rule arities cannot receive a generated proof', async () => {
  const artifact = await ingest({ text: DEMO, title: 'Draft', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() }, actor);
  const graph = await replay(artifact); const edgeId = [...graph.edges.keys()][0]!;
  assert.equal(generate(graph, edgeId), null); assert.equal((await new LeanVerifier().verify(graph, edgeId)).status, 'UNVERIFIED');
  const a = await argument([atom('P')], atom('P'), 'modus_ponens'); assert.equal(generate(await replay(a.artifact), a.edge.id), null);
});
test('imported arbitrary Lean is never executed, even with a valid recomputed artifact hash', async () => {
  const a = await argument([atom('P')], atom('P'), 'reiteration'); const graph = await replay(a.artifact);
  const receipt = await new LeanVerifier().verify(graph, a.edge.id);
  const source = 'axiom fake : False\n#eval IO.println "UNTRUSTED_EXECUTION"\n';
  const forged = { ...receipt, source, sourceHash: await hash(source) };
  const imported = await replay(await append(a.artifact, actor, [{ type: 'verification', value: forged }]));
  assert.equal(edgeStatus(imported, a.edge.id).formal, 'UNVERIFIED');
  await assert.rejects(reproduce(imported, forged.id), /safe regeneration/);
  await assert.rejects(append(a.artifact, actor, [{ type: 'verification', value: { ...receipt, inputHash: await hash('wrong') } }]), /input binding/);
  await assert.rejects(append(a.artifact, actor, [{ type: 'verification', value: { ...receipt, axioms: ['sorryAx'] } }]), /axiom-free/);
});
