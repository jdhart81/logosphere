import { append, emptyArtifact, id, type Actor, type Edge, type Formula, type Node, type Provenance } from '../packages/reasoning-core/src/core.js';
export const actor: Actor = { id: 'test:human', kind: 'human' };
export const provenance: Provenance = { method: 'human', sources: [], note: 'Explicit synthetic test input' };
export const atom = (name: string): Formula => ({ op: 'atom', name });
export const implies = (left: Formula, right: Formula): Formula => ({ op: 'implies', left, right });
export const and = (left: Formula, right: Formula): Formula => ({ op: 'and', left, right });
export const not = (arg: Formula): Formula => ({ op: 'not', arg });
export function node(formula: Formula, kind: Node['kind'] = 'premise'): Node {
  return { id: id(), kind, text: `Synthetic ${JSON.stringify(formula)}`, epistemic: kind === 'conclusion' ? 'DERIVED' : kind === 'assumption' ? 'ASSUMPTION' : 'UNRESOLVED',
    formalization: { formula, review: 'accepted', interpretation: 'Explicit synthetic formula, with no empirical truth claim' }, provenance };
}
export async function argument(inputs: Formula[], output: Formula, rule: Edge['rule'] = 'modus_ponens') {
  const nodes = inputs.map(f => node(f)); const conclusion = node(output, 'conclusion');
  const edge: Edge = { id: id(), premises: nodes.map(n => n.id), assumptions: [], conclusion: conclusion.id, rule, provenance };
  const artifact = await append(emptyArtifact(), actor, [
    ...[...nodes, conclusion].map(value => ({ type: 'node' as const, value })), { type: 'edge', value: edge },
  ]);
  return { artifact, edge, nodes, conclusion };
}
