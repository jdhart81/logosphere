import test from 'node:test';
import assert from 'node:assert/strict';
import { append, boundJson, canonical, compare, edgeStatus, emptyArtifact, hash, id, render, replay, trace, type Artifact } from '../packages/reasoning-core/src/core.js';
import { DEMO, ingest, safeUrl } from '../packages/observation/src/extract.js';
import { actor, argument, atom, implies, node, provenance } from './helpers.js';

const example = (accepted = false) => ingest({ text: DEMO, title: 'Synthetic', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() }, actor, accepted);
test('canonical JSON and hashes are stable across object-key ordering', async () => {
  assert.equal(canonical({ b: 2, a: [3, 1] }), '{"a":[3,1],"b":2}');
  assert.equal(await hash({ b: 2, a: 1 }), await hash({ a: 1, b: 2 }));
  assert.notEqual(await hash([1, 2]), await hash([2, 1]));
  for (const input of [undefined, NaN, Infinity, -0, 0.5, { a: undefined }]) assert.throws(() => canonical(input));
});
test('I1/I2: only graph events are canonical; every node is attributable', async () => {
  const artifact = await example(); const graph = await replay(artifact);
  assert.equal(graph.nodes.size, 3); assert.equal(graph.edges.size, 1);
  assert.ok([...graph.nodes.values()].every(n => n.actor.id === actor.id && n.at && n.eventHash && n.value.provenance.sources.length));
  await assert.rejects(replay({ ...artifact, answer: 'This is true' }));
  const missing = node(atom('P'));
  await assert.rejects(append(emptyArtifact(), actor, [{ type: 'node', value: { ...missing, provenance: undefined } as never }]));
});
test('I2: source hash and exact quote spans cannot be forged', async () => {
  const artifact = await example(); const graph = await replay(artifact); const source = [...graph.sources.values()][0]!.value;
  const n = node(atom('P')); n.provenance = { ...provenance, sources: [{ sourceId: source.id, start: 0, end: 4, quote: 'Fake' }] };
  await assert.rejects(append(artifact, actor, [{ type: 'node', value: n }]), /quotation/);
  await assert.rejects(append(emptyArtifact(), actor, [{ type: 'source', value: { ...source, contentHash: await hash('other') } }]), /content hash/);
  await assert.rejects(append(emptyArtifact(), actor, [{ type: 'node', value: { ...node(atom('P')), epistemic: 'EXTERNAL' } }]), /source references/);
});
test('I3: hidden assumption promotion and miscategorized inputs are rejected', async () => {
  const n = node(atom('P'), 'assumption');
  await assert.rejects(append(emptyArtifact(), actor, [{ type: 'node', value: { ...n, kind: 'premise' } }]), /Assumptions/);
  const a = await argument([implies(atom('P'), atom('Q')), atom('P')], atom('Q'));
  await assert.rejects(append(a.artifact, actor, [{ type: 'node', value: n }, { type: 'edge', value: { ...a.edge, id: id(), premises: [n.id], rule: 'reiteration' } }]), /Assumption inputs/);
});
test('I5: complete backward trace includes assumptions, sources, evidence and challenges', async () => {
  let artifact = await example(true); let graph = await replay(artifact); const edge = [...graph.edges.values()][0]!.value;
  const source = [...graph.sources.values()][0]!.value; const challengeId = id();
  artifact = await append(artifact, actor, [{ type: 'evidence', value: { id: id(), sourceId: source.id, targetId: edge.premises[0]!, status: 'INSUFFICIENT', explanation: 'No sensor calibration evidence provided', provenance } },
    { type: 'challenge', value: { id: challengeId, targetId: edge.assumptions[0]!, aspect: 'assumption', reason: 'The conditional may omit other causes.', provenance } }]);
  graph = await replay(artifact); const t = trace(graph, edge.conclusion);
  assert.equal(t.nodes.length, 3); assert.equal(t.assumptions.length, 1); assert.equal(t.sources.length, 1); assert.equal(t.evidence.length, 1); assert.equal(t.challenges[0]!.value.id, challengeId);
  assert.equal(t.edges[0]!.status.disputed, true); assert.ok(t.changeImpact.includes(edge.assumptions[0]!));
  assert.match(render(graph, edge.conclusion), /ASSUMPTION/);
});
test('I5: orphan conclusions, missing references, duplicate IDs and cycles are rejected', async () => {
  await assert.rejects(append(emptyArtifact(), actor, [{ type: 'node', value: node(atom('Q'), 'conclusion') }]), /no declared inference/);
  const a = await argument([atom('P')], atom('P'), 'reiteration');
  await assert.rejects(append(a.artifact, actor, [{ type: 'node', value: a.nodes[0]! }]), /Immutable ID/);
  await assert.rejects(append(a.artifact, actor, [{ type: 'edge', value: { ...a.edge, id: id(), premises: [id()] } }]), /missing nodes/);
  await assert.rejects(append(a.artifact, actor, [{ type: 'edge', value: { ...a.edge, id: id(), premises: [a.conclusion.id] } }]), /Cyclic/);
});
test('I6: challenges and explicit branches preserve original event prefixes', async () => {
  const original = await example(); const graph = await replay(original); const target = [...graph.nodes.keys()][0]!;
  const challenged = await append(original, { id: 'agent:critic', kind: 'agent' }, [{ type: 'challenge', value: { id: id(), targetId: target, aspect: 'premise', reason: 'Insufficient evidence', provenance } }]);
  assert.deepEqual(challenged.events.slice(0, original.events.length), original.events);
  const branch = await append(original, actor, [{ type: 'branch', value: { id: id(), fromHead: original.head!, label: 'Alternative interpretation', provenance } }]);
  assert.notEqual(branch.head, challenged.head); assert.equal((await replay(branch)).nodes.size, graph.nodes.size);
  const diff = compare(await replay(challenged), await replay(branch)); assert.equal(diff.minimal, false);
  assert.equal(diff.leftOnly.length, 1); assert.equal(diff.rightOnly.length, 1);
});
test('tampering, reordering, deletion and stale expected heads fail closed', async () => {
  const original = await example();
  const modified = structuredClone(original); modified.events[0]!.actor.id = 'forged';
  await assert.rejects(replay(modified), /hash chain/);
  await assert.rejects(replay({ ...original, events: [] }), /head mismatch/);
  await assert.rejects(append(original, actor, [{ type: 'node', value: node(atom('P')) }], null), /Head conflict/);
  const second = await append(original, actor, [{ type: 'node', value: node(atom('P')) }]);
  await assert.rejects(replay({ ...second, events: [...second.events].reverse() }), /hash chain/);
});
test('I9/I10: arbitrary prose remains unresolved and capture never implies evidence support', async () => {
  const artifact = await ingest({ text: 'This product will change everything.', title: 'Claim', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString(), url: 'https://example.com/story?token=secret#private' }, actor);
  const graph = await replay(artifact); assert.equal(graph.edges.size, 0); assert.equal(graph.evidence.size, 0);
  assert.equal([...graph.nodes.values()][0]!.value.epistemic, 'UNRESOLVED');
  assert.equal([...graph.sources.values()][0]!.value.url, 'https://example.com/story');
  assert.equal(safeUrl('javascript:alert(1)'), undefined);
  const draft = await replay(await example());
  assert.equal(edgeStatus(draft, [...draft.edges.keys()][0]!).formalizable, false);
});
test('JSON and formula complexity are bounded before recursive validation', async () => {
  let value: unknown = 'x'; for (let i = 0; i < 30; i++) value = { x: value };
  assert.throws(() => boundJson(value), /complexity/);
  await assert.rejects(replay(value));
});
test('same events roundtrip without changing hashes or projections', async () => {
  const artifact = await example(true); const restored: Artifact = JSON.parse(JSON.stringify(artifact));
  assert.deepEqual((await replay(restored)).artifact, artifact);
});
test('unpunctuated lines are retained and candidate omissions are explicit', async () => {
  const artifact = await ingest({ text: 'First line\nSecond line', title: 'Lines', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() }, actor);
  assert.equal((await replay(artifact)).nodes.size, 2);
  const many = await ingest({ text: Array.from({ length: 30 }, (_, i) => `Claim ${i}`).join('\n'), title: 'Long', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() }, actor);
  const graph = await replay(many); assert.equal(graph.nodes.size, 24);
  assert.match([...graph.sources.values()][0]!.value.provenance.note, /24 of 30/);
});
test('separate observations receive separate atom namespaces', async () => {
  const first = await example(true);
  const second = await ingest({ text: DEMO, title: 'Another source', mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() }, actor, true, first);
  const graph = await replay(second); const formulas = [...graph.nodes.values()].filter(n => n.value.kind === 'premise').map(n => canonical(n.value.formalization!.formula));
  assert.equal(formulas.length, 2); assert.notEqual(formulas[0], formulas[1]);
});
