import { z } from 'zod';
import { append, ArtifactSchema, boundJson, ChallengeSchema, compare, EdgeSchema, emptyArtifact, EvidenceSchema, Hash, Id, NodeSchema, render, replay, trace, type Actor, type Addition, type Artifact } from '../../reasoning-core/src/core.js';
import { ingest } from '../../observation/src/extract.js';
import type { Verifier } from '../../verifier/src/index.js';

const Head = { expectedHead: Hash.nullable() };
export const CommandSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('OBSERVE'), ...Head, text: z.string().min(1).max(12_000), title: z.string().max(500), url: z.string().max(2000).optional(), acceptFormalization: z.boolean() }),
  z.strictObject({ action: z.literal('ASSERT'), ...Head, node: NodeSchema }),
  z.strictObject({ action: z.literal('DECLARE'), ...Head, node: NodeSchema }),
  z.strictObject({ action: z.literal('ATTACH'), ...Head, evidence: EvidenceSchema }),
  z.strictObject({ action: z.literal('PROPOSE'), ...Head, nodes: z.array(NodeSchema).max(30), edge: EdgeSchema }),
  z.strictObject({ action: z.literal('CHALLENGE'), ...Head, challenge: ChallengeSchema }),
  z.strictObject({ action: z.literal('VERIFY'), ...Head, edgeId: Id }),
  z.strictObject({ action: z.literal('TRACE'), nodeId: Id }),
  z.strictObject({ action: z.literal('COMPARE'), artifact: ArtifactSchema }),
  z.strictObject({ action: z.literal('SUBSCRIBE') }),
  z.strictObject({ action: z.literal('RENDER'), nodeId: Id }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type Persistence = { commit(artifact: Artifact, expectedHead: string | null): Promise<void> };
type Change = { graphId: string; head: string | null; previousHead: string | null };

export class Runtime {
  private artifact: Artifact;
  readonly reproduced = new Set<string>();
  private readonly subscribers = new Set<(change: Change) => void>();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly actor: Actor, private readonly verifier: Verifier, artifact: Artifact = emptyArtifact(), private readonly storage?: Persistence) { this.artifact = structuredClone(artifact); }
  export(): Artifact { return structuredClone(this.artifact); }
  subscribe(listener: (change: Change) => void): () => void { this.subscribers.add(listener); return () => { this.subscribers.delete(listener); }; }
  /** Serializes commands; expectedHead still rejects callers acting on stale state. */
  dispatch(input: unknown): Promise<unknown> {
    // Capture the submitted command before queueing; callers cannot change a pending assertion.
    let command: Command;
    try { boundJson(input); command = CommandSchema.parse(input); } catch (error) { return Promise.reject(error); }
    const next = this.pending.then(() => this.execute(command));
    this.pending = next.catch(() => undefined);
    return next;
  }
  private async execute(input: unknown): Promise<unknown> {
    boundJson(input);
    const command = CommandSchema.parse(input);
    const graph = await replay(this.artifact);
    if (command.action === 'TRACE') return trace(graph, command.nodeId, this.reproduced);
    if (command.action === 'RENDER') return { head: this.artifact.head, nodeId: command.nodeId, text: render(graph, command.nodeId, this.reproduced) };
    if (command.action === 'COMPARE') return compare(graph, await replay(command.artifact));
    if (command.action === 'SUBSCRIBE') return { resource: 'logosphere://graph', head: this.artifact.head, transport: 'Use SDK subscribe(callback) or MCP resources/subscribe for live notifications.' };
    if (command.expectedHead !== this.artifact.head) throw new Error('Head conflict; reload before retrying');
    const previousHead = this.artifact.head;
    let next: Artifact;
    let receiptId: string | undefined;
    if (command.action === 'OBSERVE') {
      next = await ingest({ text: command.text, title: command.title, ...(command.url ? { url: command.url } : {}), mode: 'supplied', truncated: false, capturedAt: new Date().toISOString() }, this.actor, command.acceptFormalization, this.artifact);
    } else {
      const additions: Addition[] = [];
      switch (command.action) {
        case 'ASSERT':
          if (['assumption', 'conclusion'].includes(command.node.kind)) throw new Error('Use DECLARE for assumptions or PROPOSE for conclusions');
          additions.push({ type: 'node', value: command.node }); break;
        case 'DECLARE':
          if (command.node.kind !== 'assumption') throw new Error('DECLARE requires an assumption');
          additions.push({ type: 'node', value: command.node }); break;
        case 'ATTACH': additions.push({ type: 'evidence', value: command.evidence }); break;
        case 'PROPOSE': additions.push(...command.nodes.map(value => ({ type: 'node' as const, value })), { type: 'edge', value: command.edge }); break;
        case 'CHALLENGE': additions.push({ type: 'challenge', value: command.challenge }); break;
        case 'VERIFY': {
          const receipt = await this.verifier.verify(graph, command.edgeId); receiptId = receipt.id;
          additions.push({ type: 'verification', value: receipt }); break;
        }
      }
      next = await append(this.artifact, this.actor, additions, command.expectedHead);
    }
    await this.storage?.commit(next, previousHead);
    this.artifact = next;
    if (receiptId) this.reproduced.add(receiptId);
    for (const notify of this.subscribers) {
      try { notify({ graphId: next.graphId, head: next.head, previousHead }); } catch { /* Subscriber errors never roll back a committed graph. */ }
    }
    return { artifact: this.export(), ...(receiptId ? { receiptId } : {}) };
  }
}
