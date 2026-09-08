import { ARTIFACT_BYTE_LIMIT, ArtifactSchema, ActorSchema, AdditionSchema, boundJson, type Actor, type Addition, type Artifact, type Edge, type Event, type Node, type Receipt, type Source } from './schema.js';
export * from './schema.js';

export function canonical(value: unknown): string {
  boundJson(value);
  const encode = (v: unknown): string => {
    if (Array.isArray(v)) return `[${v.map(encode).join(',')}]`;
    if (v !== null && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${encode((v as Record<string, unknown>)[k])}`).join(',')}}`;
    return JSON.stringify(v);
  };
  return encode(value);
}
export async function hash(value: unknown): Promise<string> {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return `sha256:${Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('')}`;
}
export const id = (): string => crypto.randomUUID();
export const emptyArtifact = (): Artifact => ({ format: 'logosphere/1', graphId: id(), events: [], head: null });

export type Entry<T> = { value: T; actor: Actor; at: string; eventHash: string };
export type Graph = {
  artifact: Artifact;
  sources: Map<string, Entry<Source>>; nodes: Map<string, Entry<Node>>; edges: Map<string, Entry<Edge>>;
  evidence: Map<string, Entry<Extract<Addition, { type: 'evidence' }>['value']>>;
  challenges: Map<string, Entry<Extract<Addition, { type: 'challenge' }>['value']>>;
  verifications: Map<string, Entry<Receipt>>;
};
const fail = (message: string): never => { throw new Error(message); };

/** This is the exact deduction input, independent of rendered prose or receipts. */
export function verificationInput(graph: Graph, edgeId: string) {
  const edge = graph.edges.get(edgeId)?.value ?? fail('Unknown inference');
  return {
    protocol: 'logosphere/deduction/1', edge,
    inputs: [...edge.premises, ...edge.assumptions].map(x => graph.nodes.get(x)!.value),
    conclusion: graph.nodes.get(edge.conclusion)!.value,
  };
}

export async function replay(input: unknown): Promise<Graph> {
  boundJson(input);
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > ARTIFACT_BYTE_LIMIT) fail('Artifact exceeds 2 MB');
  const artifact = ArtifactSchema.parse(input);
  const graph: Graph = { artifact, sources: new Map(), nodes: new Map(), edges: new Map(), evidence: new Map(), challenges: new Map(), verifications: new Map() };
  const seen = new Set<string>();
  let head: string | null = null;
  for (const [index, event] of artifact.events.entries()) {
    const { hash: eventHash, ...body } = event;
    if (body.graphId !== artifact.graphId || body.seq !== index || body.parent !== head || await hash(body) !== eventHash) fail('Broken event hash chain');
    for (const addition of event.additions) {
      const v = addition.value;
      if (seen.has(v.id)) fail('Immutable ID already exists');
      if (seen.size >= 4000) fail('Graph object limit exceeded');
      for (const ref of v.provenance.sources) {
        const source = graph.sources.get(ref.sourceId)?.value ?? fail('Provenance source does not exist');
        if (ref.end <= ref.start || ref.end > source.text.length || source.text.slice(ref.start, ref.end) !== ref.quote) fail('Provenance quotation mismatch');
      }
      const entry = <T>(value: T): Entry<T> => ({ value, actor: event.actor, at: event.at, eventHash });
      switch (addition.type) {
        case 'source': {
          if (await hash(addition.value.text) !== addition.value.contentHash) fail('Source content hash mismatch');
          graph.sources.set(v.id, entry(addition.value)); break;
        }
        case 'node': {
          const node = addition.value;
          if ((node.kind === 'assumption') !== (node.epistemic === 'ASSUMPTION')) fail('Assumptions must remain explicit');
          if ((node.kind === 'conclusion') !== (node.epistemic === 'DERIVED')) fail('Conclusions require DERIVED epistemic status');
          if (node.kind === 'observation' && !node.provenance.sources.length) fail('Observations require source provenance');
          if (['EMPIRICAL', 'EXTERNAL'].includes(node.epistemic) && !node.provenance.sources.length) fail('Empirical and external nodes require source references');
          if (node.replaces && !graph.nodes.has(node.replaces)) fail('Replacement must reference an existing node');
          graph.nodes.set(v.id, entry(node)); break;
        }
        case 'edge': {
          const edge = addition.value;
          const inputs = [...edge.premises, ...edge.assumptions];
          if (!inputs.length) fail('Inference requires declared inputs');
          if (new Set(inputs).size !== inputs.length) fail('Duplicate inference input');
          if (!graph.nodes.has(edge.conclusion) || inputs.some(x => !graph.nodes.has(x))) fail('Inference references missing nodes');
          if (graph.nodes.get(edge.conclusion)!.value.kind !== 'conclusion') fail('Inference output must be a conclusion');
          if (edge.premises.some(x => graph.nodes.get(x)!.value.kind === 'assumption') || edge.assumptions.some(x => graph.nodes.get(x)!.value.kind !== 'assumption')) fail('Assumption inputs must be declared separately');
          graph.edges.set(v.id, entry(edge)); break;
        }
        case 'evidence': {
          if (!graph.nodes.has(addition.value.targetId) || !graph.sources.has(addition.value.sourceId)) fail('Evidence references missing objects');
          graph.evidence.set(v.id, entry(addition.value)); break;
        }
        case 'challenge': {
          if (!seen.has(addition.value.targetId) || (addition.value.alternativeId && !seen.has(addition.value.alternativeId))) fail('Challenge target or alternative does not exist');
          graph.challenges.set(v.id, entry(addition.value)); break;
        }
        case 'verification': {
          const receipt = addition.value;
          if (event.additions.length !== 1) fail('Verification must be its own transaction');
          if (receipt.basisHead !== head || receipt.inputHash !== await hash(verificationInput(graph, receipt.edgeId))) fail('Verification input binding mismatch');
          if (receipt.sourceHash !== await hash(receipt.source)) fail('Proof source hash mismatch');
          if (receipt.status !== 'UNVERIFIED' && (receipt.exitCode !== 0 || !receipt.source || receipt.axioms === null || receipt.axioms.length)) fail('Successful verification needs axiom-free successful execution evidence');
          graph.verifications.set(v.id, entry(receipt)); break;
        }
        case 'branch': {
          if (addition.value.fromHead !== head) fail('Branch must preserve the exact prefix');
          break;
        }
      }
      seen.add(v.id);
    }
    validateDependencies(graph);
    head = eventHash;
  }
  if (artifact.head !== head) fail('Artifact head mismatch');
  return graph;
}

function validateDependencies(graph: Graph): void {
  const parents = new Map<string, string[]>();
  for (const { value: edge } of graph.edges.values()) parents.set(edge.conclusion, [...(parents.get(edge.conclusion) ?? []), ...edge.premises, ...edge.assumptions]);
  for (const { value: node } of graph.nodes.values()) if (node.kind === 'conclusion' && !parents.has(node.id)) fail('Conclusion has no declared inference');
  const heights = new Map<string, number>();
  const visiting = new Set<string>();
  function visit(nodeId: string, recursionDepth: number): number {
    if (recursionDepth > 256) fail('Dependency depth limit exceeded');
    if (visiting.has(nodeId)) fail('Cyclic inference dependencies');
    const previous = heights.get(nodeId);
    if (previous !== undefined) return previous;
    visiting.add(nodeId);
    let height = 0;
    for (const parent of parents.get(nodeId) ?? []) height = Math.max(height, 1 + visit(parent, recursionDepth + 1));
    if (height > 256) fail('Dependency depth limit exceeded');
    visiting.delete(nodeId); heights.set(nodeId, height);
    return height;
  }
  for (const nodeId of graph.nodes.keys()) visit(nodeId, 0);
}

export async function append(artifact: Artifact, actor: Actor, additions: Addition[], expectedHead = artifact.head): Promise<Artifact> {
  await replay(artifact);
  if (artifact.head !== expectedHead) fail('Head conflict; reload before retrying');
  boundJson(additions);
  const body = {
    format: 'logosphere/event/1' as const, graphId: artifact.graphId, seq: artifact.events.length, parent: artifact.head,
    actor: ActorSchema.parse(actor), at: new Date().toISOString(), additions: additions.map(x => AdditionSchema.parse(x)),
  };
  const event: Event = { ...body, hash: await hash(body) };
  const next: Artifact = { ...artifact, events: [...artifact.events, event], head: event.hash };
  await replay(next);
  return next;
}

export function edgeStatus(graph: Graph, edgeId: string, reproduced = new Set<string>()) {
  const input = verificationInput(graph, edgeId);
  const receipts = [...graph.verifications.values()].filter(x => x.value.edgeId === edgeId);
  const latest = receipts.at(-1)?.value;
  const accepted = [...input.inputs, input.conclusion].every(x => x.formalization?.review === 'accepted');
  const support = collectSupport(graph, input.conclusion.id);
  const disputed = support.challenges.size > 0 || support.evidence.some(e => e.value.status === 'DISPUTED');
  return {
    formal: latest && reproduced.has(latest.id) ? latest.status : 'UNVERIFIED',
    reported: latest?.status ?? null, receiptId: latest?.id ?? null,
    formalizable: accepted && input.edge.rule !== 'informal', disputed,
    scope: 'Conditional deduction from the declared inputs; no empirical truth or semantic translation is certified.',
  };
}

function collectSupport(graph: Graph, nodeId: string) {
  if (!graph.nodes.has(nodeId)) fail('Unknown trace target');
  const nodeIds = new Set<string>(); const edgeIds = new Set<string>();
  function visit(current: string): void {
    if (nodeIds.has(current)) return;
    nodeIds.add(current);
    for (const { value: edge } of graph.edges.values()) if (edge.conclusion === current) {
      edgeIds.add(edge.id); [...edge.premises, ...edge.assumptions].forEach(visit);
    }
  }
  visit(nodeId);
  const evidence = [...graph.evidence.values()].filter(x => nodeIds.has(x.value.targetId));
  const nodes = [...nodeIds].map(x => graph.nodes.get(x)!);
  const edges = [...edgeIds].map(x => graph.edges.get(x)!);
  const verifications = [...graph.verifications.values()].filter(x => edgeIds.has(x.value.edgeId));
  const sourceIds = new Set(evidence.map(e => e.value.sourceId));
  const targets = new Set([...nodeIds, ...edgeIds, ...evidence.map(x => x.value.id), ...verifications.map(x => x.value.id)]);
  const provenanceSources = (entries: { value: { provenance: { sources: { sourceId: string }[] } } }[]) => {
    for (const entry of entries) for (const ref of entry.value.provenance.sources) sourceIds.add(ref.sourceId);
  };
  provenanceSources([...nodes, ...edges, ...evidence, ...verifications]);
  const challenges: Graph['challenges'] = new Map();
  let previousSize = -1;
  while (previousSize !== sourceIds.size + challenges.size) {
    previousSize = sourceIds.size + challenges.size;
    // Include provenance-of-provenance and evidence used to challenge the chain.
    for (const sourceId of sourceIds) { targets.add(sourceId); provenanceSources([graph.sources.get(sourceId)!]); }
    for (const [challengeId, challenge] of graph.challenges) if (targets.has(challenge.value.targetId)) {
      challenges.set(challengeId, challenge); targets.add(challengeId); provenanceSources([challenge]);
    }
  }
  return { nodeIds, edgeIds, nodes, edges, evidence, verifications, challenges,
    sources: [...sourceIds].map(x => graph.sources.get(x)!),
  };
}

export function trace(graph: Graph, nodeId: string, reproduced = new Set<string>()) {
  const support = collectSupport(graph, nodeId);
  const { nodeIds, edgeIds, nodes, evidence, sources, verifications } = support;
  return {
    head: graph.artifact.head, target: nodeId, nodes, evidence, sources, verifications,
    edges: support.edges.map(e => ({ ...e, status: edgeStatus(graph, e.value.id, reproduced) })),
    challenges: [...support.challenges.values()],
    assumptions: nodes.filter(x => x.value.kind === 'assumption').map(x => x.value.id),
    unresolvedLeaves: nodes.filter(x => x.value.epistemic === 'UNRESOLVED').map(x => x.value.id),
    changeImpact: [...nodeIds, ...edgeIds, ...sources.map(s => s.value.id), ...evidence.map(e => e.value.id)],
  };
}

export function render(graph: Graph, nodeId: string, reproduced = new Set<string>()): string {
  const t = trace(graph, nodeId, reproduced);
  return [graph.nodes.get(nodeId)!.value.text, ...t.edges.map(e => `${e.status.formal}: ${e.value.rule}; conditional on ${e.value.premises.length} premise(s) and ${e.value.assumptions.length} assumption(s).`),
    ...t.nodes.filter(n => n.value.kind !== 'conclusion').map(n => `${n.value.epistemic}: ${n.value.text}`),
    `${t.challenges.length} challenge(s). ${t.evidence.length} evidence assessment(s).`,
    'Formal validity does not establish empirical truth. The mapping from language to symbols is an interpretation.',
  ].join('\n');
}

/** Exact object comparison only; no semantic equivalence or minimum-divergence claim. */
export function compare(left: Graph, right: Graph) {
  const objects = (graph: Graph) => new Map(graph.artifact.events.flatMap(event => event.additions.map(addition => [addition.value.id, canonical({ addition, actor: event.actor, at: event.at })] as const)));
  const a = objects(left);
  const b = objects(right);
  return { method: 'immutable-id-structural-diff', minimal: false,
    shared: [...a.keys()].filter(x => b.get(x) === a.get(x)),
    leftOnly: [...a.keys()].filter(x => !b.has(x)), rightOnly: [...b.keys()].filter(x => !a.has(x)),
    conflictingIds: [...a.keys()].filter(x => b.has(x) && a.get(x) !== b.get(x)),
    limitation: 'No semantic alignment; this is not a minimum divergence set.' };
}
