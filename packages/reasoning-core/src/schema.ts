import { z } from 'zod';

export const ARTIFACT_BYTE_LIMIT = 2_000_000;

export const Id = z.string().uuid();
export const Hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const Text = z.string().min(1).max(12_000);
export const ActorSchema = z.strictObject({ id: z.string().min(1).max(200), kind: z.enum(['human', 'agent', 'system']) });
export const ProvenanceSchema = z.strictObject({
  method: z.enum(['capture', 'extraction', 'human', 'agent', 'verification', 'import']),
  sources: z.array(z.strictObject({ sourceId: Id, start: z.number().int().min(0), end: z.number().int().min(1), quote: Text })).max(30),
  note: z.string().max(2000),
});
export type Formula = { op: 'atom'; name: string } | { op: 'not'; arg: Formula } |
  { op: 'and' | 'implies'; left: Formula; right: Formula };
export const FormulaSchema: z.ZodType<Formula> = z.lazy(() => z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('atom'), name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/) }),
  z.strictObject({ op: z.literal('not'), arg: FormulaSchema }),
  z.strictObject({ op: z.literal('and'), left: FormulaSchema, right: FormulaSchema }),
  z.strictObject({ op: z.literal('implies'), left: FormulaSchema, right: FormulaSchema }),
]));
export const SourceSchema = z.strictObject({
  id: Id, title: z.string().max(500), url: z.string().url().regex(/^https?:\/\//).max(2000).optional(),
  text: Text, capturedAt: z.string().datetime(), contentHash: Hash,
  mode: z.enum(['selection', 'viewport', 'supplied']), truncated: z.boolean(), provenance: ProvenanceSchema,
});
export const NodeSchema = z.strictObject({
  id: Id, kind: z.enum(['observation', 'claim', 'premise', 'assumption', 'interpretation', 'conclusion']),
  text: Text,
  epistemic: z.enum(['EMPIRICAL', 'EXTERNAL', 'ASSUMPTION', 'PROBABILISTIC', 'INTERPRETATION', 'UNRESOLVED', 'DERIVED']),
  formalization: z.strictObject({ formula: FormulaSchema, review: z.enum(['proposed', 'accepted']), interpretation: Text }).optional(),
  replaces: Id.optional(), provenance: ProvenanceSchema,
});
export const EdgeSchema = z.strictObject({
  id: Id, premises: z.array(Id).max(16), assumptions: z.array(Id).max(16), conclusion: Id,
  rule: z.enum(['modus_ponens', 'and_intro', 'and_left', 'and_right', 'reiteration', 'informal']),
  provenance: ProvenanceSchema,
});
export const EvidenceSchema = z.strictObject({
  id: Id, targetId: Id, sourceId: Id, status: z.enum(['SUPPORTED', 'DISPUTED', 'INSUFFICIENT', 'UNRESOLVED']),
  explanation: Text, provenance: ProvenanceSchema,
});
export const ChallengeSchema = z.strictObject({
  id: Id, targetId: Id, aspect: z.enum(['observation', 'source', 'premise', 'assumption', 'interpretation', 'inference', 'formalization', 'conclusion', 'evidence']),
  reason: Text, alternativeId: Id.optional(), provenance: ProvenanceSchema,
});
export const ReceiptSchema = z.strictObject({
  id: Id, edgeId: Id, inputHash: Hash, basisHead: Hash,
  engine: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), adapterVersion: z.string().min(1).max(100),
  toolchain: z.string().max(100), engineVersion: z.string().max(500),
  invocation: z.strictObject({ command: z.string().min(1).max(100), args: z.array(z.string().max(200)).max(20) }),
  status: z.enum(['PROVEN', 'REFUTED', 'UNVERIFIED']), reason: Text,
  source: z.string().max(50_000), sourceHash: Hash, theorem: z.string().min(1).max(200),
  stdout: z.string().max(64_000), stderr: z.string().max(64_000),
  exitCode: z.number().int().nullable(), axioms: z.array(z.string().max(200)).max(30).nullable(), provenance: ProvenanceSchema,
});
export const AdditionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('source'), value: SourceSchema }),
  z.strictObject({ type: z.literal('node'), value: NodeSchema }),
  z.strictObject({ type: z.literal('edge'), value: EdgeSchema }),
  z.strictObject({ type: z.literal('evidence'), value: EvidenceSchema }),
  z.strictObject({ type: z.literal('challenge'), value: ChallengeSchema }),
  z.strictObject({ type: z.literal('verification'), value: ReceiptSchema }),
  z.strictObject({ type: z.literal('branch'), value: z.strictObject({ id: Id, fromHead: Hash, label: Text, provenance: ProvenanceSchema }) }),
]);
export const EventSchema = z.strictObject({
  format: z.literal('logosphere/event/1'), graphId: Id, seq: z.number().int().nonnegative(), parent: Hash.nullable(),
  actor: ActorSchema, at: z.string().datetime(), additions: z.array(AdditionSchema).min(1).max(100), hash: Hash,
});
export const ArtifactSchema = z.strictObject({
  format: z.literal('logosphere/1'), graphId: Id, events: z.array(EventSchema).max(1000), head: Hash.nullable(),
});
export type Actor = z.infer<typeof ActorSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type Edge = z.infer<typeof EdgeSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
export type Addition = z.infer<typeof AdditionSchema>;
export type Event = z.infer<typeof EventSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;

/** Bound untrusted JSON before recursive schemas or hashing. */
export function boundJson(value: unknown): void {
  const queue: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let count = 0;
  while (queue.length) {
    const item = queue.pop()!;
    if (++count > 300_000 || item.depth > 24) throw new Error('JSON complexity limit exceeded');
    const v = item.value;
    if (typeof v === 'number' && (!Number.isSafeInteger(v) || Object.is(v, -0))) throw new Error('Only safe JSON integers are supported');
    if (typeof v === 'string' && v.length > 64_000) throw new Error('String limit exceeded');
    if (v !== null && typeof v === 'object') {
      if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype) throw new Error('Expected plain JSON');
      for (const child of Object.values(v)) queue.push({ value: child, depth: item.depth + 1 });
    } else if (!['string', 'number', 'boolean'].includes(typeof v) && v !== null) throw new Error('Invalid JSON value');
  }
}
