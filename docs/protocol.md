# Canonical artifact and agent protocol v1

## Encoding

Normative runtime schemas live in `packages/reasoning-core/src/schema.ts` and `packages/sdk/src/index.ts`. `npm run build` emits JSON Schema 2020-12 into `schemas/`. Consumers must additionally implement replay invariants: JSON Schema alone cannot validate source slices, reference existence, history, dependencies or execution claims.

All hashes are `sha256:` plus 64 lowercase hexadecimal digits. Hash input is UTF-8 of canonical JSON: recursively sort object keys with JavaScript UTF-16 ordering, preserve arrays, serialize strings with JSON escaping, accept only finite safe integers (no negative zero), booleans and null. Unicode is not normalized. Source/proof string hashes also hash their **canonical JSON string encoding**, including quotes, not raw file bytes. This v1 encoding is specified here; it is not advertised as full RFC 8785 support. Object keys used by schemas are ASCII. JSON is bounded to depth 24 and 300,000 values before schema traversal. Network/import/store limits are 2 MB; sources are limited to 12,000 UTF-16 code units. Source offsets also use UTF-16 code units.

An event hashes `{format,graphId,seq,parent,actor,at,additions}`. `parent` is null at genesis and the prior event hash thereafter. `seq` starts at zero. Artifact `head` equals the final event hash. UUIDs identify objects; event hashes identify revisions. A branch keeps the graph ID and exact event prefix, then records its parent head; subsequent heads distinguish branches. A single FileStore holds one branch tip. Store competing tips in separate local directories or exported artifacts.

Node/edge additions that form a conclusion are one atomic transaction. Replacement is an additional node with `replaces`; it does not retarget existing edges. Propose new edges explicitly. Inference premises may reference prior conclusions, but dependency cycles are prohibited. Evidence is attached to a node, assessed separately from formal status, and can itself be challenged. Challenges can target sources, nodes, edges, evidence or receipts; aspect describes the disputed component. No operation silently resolves or removes a challenge.

## Status projections

| Axis | Values | Meaning |
|---|---|---|
| Node epistemic category | EMPIRICAL, EXTERNAL, ASSUMPTION, PROBABILISTIC, INTERPRETATION, UNRESOLVED, DERIVED | What kind of support or origin the proposition has; empirical/external nodes require a source reference, not proof of authenticity |
| Evidence assessment | SUPPORTED, DISPUTED, INSUFFICIENT, UNRESOLVED | An attributed assessment, not Lean output |
| Edge formal status | PROVEN, REFUTED, UNVERIFIED | Conditional kernel-checked deduction, checked conditional negation, or not established |
| Formalizability | true/false | Whether all mappings are accepted and a formal rule is declared; the adapter can still decline unsupported arity |
| Challenge state | disputed boolean plus retained challenges | Includes upstream nodes, evidence, sources and receipts; disagreement never destroys the original object |

A receipt carries the exact input hash, graph head at execution, generated source and its hash, engine/adapter version, toolchain, actual version/commit output, theorem name, structured invocation, stdout/stderr and exit code. A verified receipt is axiom-free in the current adapter; an unverified attempt has no established axiom report (`null`). Reproduction requires the recorded toolchain and compiler commit, status, input hash and safely regenerated source to match. Platform-specific runtime descriptions are compared separately. Reproduction is relative to the local installed Lean binary, which remains in the trusted computing base. The generic graph can carry receipts from additional engines; the Lean adapter refuses unsupported engines/invocations.

## Shared commands

All commands validate against `schemas/command.schema.json`. Runtime construction supplies the actor. For MCP tool calls, use the action name as `name`; omit the redundant `action` field from `arguments`.

| Command | Required command data beyond action | Effect |
|---|---|---|
| OBSERVE | expectedHead, text, title, acceptFormalization; optional url | Append a bounded supplied source, candidate nodes and any recognized edges |
| ASSERT | expectedHead, node | Append a claim/premise/observation/interpretation; assumptions use DECLARE |
| DECLARE | expectedHead, node | Append an explicit assumption node |
| ATTACH | expectedHead, evidence | Append a source-backed evidence assessment for a node |
| PROPOSE | expectedHead, nodes, edge | Atomically add required nodes and one inference edge |
| CHALLENGE | expectedHead, challenge | Append disagreement targeting an existing object |
| VERIFY | expectedHead, edgeId | Generate safe Lean, execute locally and append a receipt, including failed attempts |
| TRACE | nodeId | Return complete declared dependencies and supporting/challenged objects |
| COMPARE | artifact | Compare current graph to a validated artifact; exact immutable-object differences only |
| SUBSCRIBE | none | Describe subscription transport; use SDK subscribe or MCP resources/subscribe |
| RENDER | nodeId | Produce text tied to the graph head and target node |

Read `logosphere://graph` to get current `head`, IDs and the canonical artifact. An empty artifact has `head: null`. Use `crypto.randomUUID()` for new object IDs. Provenance has `method`, `sources: [{sourceId,start,end,quote}]`, and a `note`; actor and timestamp are supplied in the event envelope. A human-supplied premise can have no source references and a clear human-attribution note. It cannot become an EXTERNAL/EMPIRICAL sourced fact without a reference.

Example MCP exchange (JSON lines; request IDs are illustrative):

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"research-agent","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"resources/subscribe","params":{"uri":"logosphere://graph"}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"OBSERVE","arguments":{"expectedHead":null,"title":"Synthetic argument","text":"Assumption: If P, then Q. Premise: P. Therefore: Q.","acceptFormalization":false}}}
{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"logosphere://graph"}}
```

MCP advertises protocol 2025-11-25, tools and resource subscriptions over stdio. Graph mutations are serialized; stale heads fail. Commands are validated and copied before queuing. Tool calls accept optional `_meta` without storing it in the graph; M1 emits no progress notifications. Calls without a request ID do not execute mutations. Notifications are hints to reread the canonical head. Reconnection restores a graph from the local store but requires a new subscription. Cancellation notifications are accepted; they do not interrupt a bounded in-progress Lean job in M1. There is no resumable event cursor or distributed writer coordination yet.

## HTTP verification bridge

`POST http://127.0.0.1:4318/verify`, exact JSON content type, bearer pairing token, body `{artifact,edgeId}`. Browser requests must have the exact configured `chrome-extension://…` origin. Response `{artifact,receiptId}` appends exactly one receipt to the submitted graph. Service memory is discarded after each request; it writes no graph store. Its Lean temporary directory is removed in `finally`. Max body 2 MB, one active request, fixed time/resource limits. The token rotates on restart.

## Durable storage

FileStore writes and syncs a private temporary snapshot, exclusively publishes the complete bytes under a hash filename using a hard link, syncs the snapshots directory, then atomically replaces and syncs HEAD while holding an exclusive writer directory lock. The filesystem must support hard links, atomic rename and directory fsync (supported local macOS/Linux filesystems are the M1 target). It verifies every load and requires that commits preserve the existing prefix. Files are size-bounded before allocation and decoded as strict UTF-8. A crash can leave an orphan snapshot or lock. Retrying the same complete orphan reconciles its bytes before advancing HEAD. If a lock persists after all writers are stopped, inspect the store and remove only `.writer-lock`, then load/reverify HEAD. There is no automatic stale-lock deletion because a live writer must never be displaced. Keep original snapshots for audit until an explicit privacy deletion.
