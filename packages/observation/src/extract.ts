import { append, emptyArtifact, hash, id, type Actor, type Addition, type Artifact, type Formula, type Node, type Provenance } from '../../reasoning-core/src/core.js';

export type Capture = { text: string; title: string; url?: string; mode: 'selection' | 'viewport' | 'supplied'; truncated: boolean; capturedAt: string };
export const DEMO = 'Assumption: If the sensor reading is accurate, then the reservoir level is low.\nPremise: The sensor reading is accurate.\nTherefore: The reservoir level is low.';
const normalize = (s: string) => s.trim().replace(/[.!?]+$/, '').trim().toLowerCase();
export function safeUrl(raw: string): string | undefined {
  try { const u = new URL(raw); if (!['http:', 'https:'].includes(u.protocol)) return undefined; u.username = ''; u.password = ''; u.search = ''; u.hash = ''; return u.href; } catch { return undefined; }
}

/** Conservative sentence/label matching, not a general NLP argument parser. */
export async function ingest(capture: Capture, actor: Actor, accepted = false, artifact: Artifact = emptyArtifact()): Promise<Artifact> {
  const text = capture.text.slice(0, 12_000);
  if (!text.trim()) throw new Error('No captured text');
  const sourceId = id();
  const provenance = (start: number, end: number): Provenance => ({
    method: 'extraction', sources: [{ sourceId, start, end, quote: text.slice(start, end) }],
    note: 'Deterministic candidate extraction v1; no external evidence assessment or verified semantic translation.',
  });
  const url = capture.url ? safeUrl(capture.url) : undefined;
  const allSegments = [...text.matchAll(/[^\n.!?]+(?:[.!?]+|(?=\n|$))/g)].filter(m => m[0].trim());
  const coverage = allSegments.length > 24 ? ` Only the first 24 of ${allSegments.length} candidate sentences are modeled; remaining captured text is not modeled.` : '';
  const additions: Addition[] = [{ type: 'source', value: {
    id: sourceId, title: capture.title.slice(0, 500), ...(url ? { url } : {}), text,
    capturedAt: capture.capturedAt, mode: capture.mode, truncated: capture.truncated || capture.text.length > 12_000,
    contentHash: await hash(text), provenance: { method: 'capture', sources: [], note: `Stored bounded text; source authenticity has not been verified.${coverage}` },
  } }];
  const segments = allSegments.slice(0, 24);
  const candidates = segments.map(m => {
    const raw = m[0]; const start = m.index + raw.search(/\S/); const end = m.index + raw.trimEnd().length;
    const clean = raw.trim(); const label = /^(Assumption|Premise|Observation|Claim|Therefore|Conclusion):\s*/i.exec(clean);
    // An empty label is an unresolved fragment, not an invalid empty proposition.
    const body = (label ? clean.slice(label[0].length) : clean) || clean;
    return { start, end, body, label: label?.[1]?.toLowerCase() ?? '', conditional: /^if (.+?),? then (.+?)[.!?]*$/i.exec(body), id: id() };
  });
  if (!candidates.length) candidates.push({ start: 0, end: text.length, body: text, label: '', conditional: null, id: id() });
  const atomMap = new Map<string, string>();
  const atom = (s: string): Formula => {
    // Separate captures must never accidentally share logical atoms solely because both start at p0.
    const key = normalize(s); if (!atomMap.has(key)) atomMap.set(key, `s${sourceId.replaceAll('-', '').slice(0, 24)}p${atomMap.size}`);
    return { op: 'atom', name: atomMap.get(key)! };
  };
  const matches: { conditional: typeof candidates[number]; premise: typeof candidates[number]; conclusion: typeof candidates[number] }[] = [];
  const outputs = new Set(candidates.filter(c => ['therefore', 'conclusion'].includes(c.label)).map(c => c.id));
  const established = new Set(candidates.filter(c => !outputs.has(c.id)).map(c => c.id));
  // Extend only from declared inputs or an already-derived conclusion. This retains
  // multi-step chains without inventing a root premise or closing circular arguments.
  let progress = true;
  while (progress) {
    progress = false;
    for (const conditional of candidates) if (conditional.conditional && established.has(conditional.id)) {
      const [, from, to] = conditional.conditional;
      const premise = candidates.find(c => c.id !== conditional.id && established.has(c.id) && normalize(c.body) === normalize(from!));
      const conclusion = candidates.find(c => outputs.has(c.id) && !established.has(c.id) && normalize(c.body) === normalize(to!));
      if (premise && conclusion) {
        matches.push({ conditional, premise, conclusion }); established.add(conclusion.id); progress = true;
      }
    }
  }
  const nodes = new Map<string, Node>();
  for (const c of candidates) {
    const isOutput = matches.some(m => m.conclusion.id === c.id);
    const participates = matches.some(m => [m.conditional.id, m.premise.id, m.conclusion.id].includes(c.id));
    const kind: Node['kind'] = isOutput ? 'conclusion' : c.label === 'assumption' ? 'assumption' : c.label === 'premise' ? 'premise' : c.label === 'observation' ? 'observation' : 'claim';
    const formula: Formula = c.conditional ? { op: 'implies', left: atom(c.conditional[1]!), right: atom(c.conditional[2]!) } : atom(c.body);
    const node: Node = {
      id: c.id, kind, text: c.body, epistemic: isOutput ? 'DERIVED' : kind === 'assumption' ? 'ASSUMPTION' : kind === 'observation' ? 'EMPIRICAL' : 'UNRESOLVED',
      ...(participates ? { formalization: { formula, review: accepted ? 'accepted' as const : 'proposed' as const,
        interpretation: `Candidate mapping: ${JSON.stringify(formula)} means “${c.body}”. Acceptance reviews this mapping only, not premise truth.` } } : {}),
      provenance: provenance(c.start, c.end),
    };
    nodes.set(c.id, node); additions.push({ type: 'node', value: node });
  }
  for (const m of matches) {
    const inputs = [nodes.get(m.conditional.id)!, nodes.get(m.premise.id)!];
    additions.push({ type: 'edge', value: {
      id: id(), premises: inputs.filter(n => n.kind !== 'assumption').map(n => n.id), assumptions: inputs.filter(n => n.kind === 'assumption').map(n => n.id),
      conclusion: m.conclusion.id, rule: 'modus_ponens', provenance: provenance(m.conclusion.start, m.conclusion.end),
    } });
  }
  return append(artifact, actor, additions);
}
