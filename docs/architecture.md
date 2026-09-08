# Logosphere foundation: decisions before implementation

## Engineering invariants and acceptance criteria

1. **Graph primacy:** the portable artifact contains only graph events and their chain. RENDER reads a validated graph; no API writes an independent canonical answer.
2. **Provenance:** every source, node, edge, challenge and verification has an immutable ID and attribution, capture/creation time, method and source references where applicable. A quotation must match an existing source slice.
3. **Explicit assumptions:** assumption nodes have ASSUMPTION epistemic status, appear in a distinct edge input list and remain visible in backward traces. A derived conclusion must have an inference dependency.
4. **Formal/evidential separation:** node epistemic category and evidence assessments are independent of edge verification. Lean success never updates a premise's evidential status. A theorem quantifies atoms and takes all declared inputs as hypotheses.
5. **Traceability:** inference dependencies form a DAG; references must exist. Traces include all premises, assumptions, evidence, formalizations and challenges. Graph completeness means complete *declared* reasoning, not omniscient extraction of hidden premises.
6. **Non-destructive challenge:** challenges append and target an exact object; replacement nodes and alternative edges retain their predecessors. A fork copies its prefix and appends a branch record.
7. **Reproducibility:** a receipt binds the exact edge, immutable formalizations, generated source, toolchain/version, source hash, theorem, invocation, output and base graph head. Import validates integrity but does not trust a claimed successful execution. Reverification regenerates safe source and reruns Lean.
8. **Agent/human symmetry:** the same commands and actor schema apply to both. Attribution is declared identity, not authenticated identity or a trust score.
9. **Privacy by architecture:** a user gesture captures at most 12,000 characters of selected or visible text; exclude editable/hidden elements. No background observer, screenshots, cookies, cloud, telemetry or persistent browser data by default. Local verification is an explicit second action.
10. **No false certainty:** missing mappings, unsupported rules, unavailable Lean, timeouts and failed attempts stay UNVERIFIED/UNRESOLVED. REFUTED requires a successfully checked negation under the declared premises, never merely a compiler error.

These are enforced through schema validation, replay validation, status projection and integration tests.

## Assumptions and open questions

Decisions for M0/M1: Node.js 20+, strict TypeScript, Chromium Manifest V3, pinned Lean 4.28.0 with core library only, no model provider, no account, no hosted service. Use SHA-256 of a specified deterministic JSON encoding, local files for agent persistence, and transient extension memory. Apache-2.0 is the initial license choice. The extraction baseline is deterministic and intentionally limited; arbitrary prose remains unresolved and is editable before accepting a mapping.

Open, deferred decisions: research-grade extraction/model evaluation; identity signing and public timestamp anchoring; source authenticity and evidence quality assessments; ontology and cross-graph semantic alignment; full first-order/mathematical formalization; continuous per-site capture permissions and retention; collaboration and revocation; independent kernel implementations; distribution through browser stores. None blocks the bounded slice. Hash chains detect changes against a known head, but cannot authenticate authors or detect a fully rewritten unanchored history.

## Canonical schema

`Artifact { format: "logosphere/1", graphId: UUID, events: Event[], head: SHA256|null }`.

`Event { format: "logosphere/event/1", graphId, seq, parent, actor:{id,kind:human|agent|system}, at, additions: Addition[], hash }`. Hash input is every field except `hash`, UTF-8 JSON with sorted object keys, preserved array order, no undefined/non-finite values. Only bounded JSON values are accepted. The schema version travels in every event. IDs are UUIDs, references immutable, and replay rejects duplicate IDs, orphan references, invalid quotations, tampering, cycles, dependency chains deeper than 256 nodes and unaccounted conclusions. The encoded artifact is limited to 2 MB, including through the SDK.

Operations append sources; nodes; inference edges; evidence links; challenges; verification receipts; and branch records. Nodes record kind (`observation`, `claim`, `premise`, `assumption`, `interpretation`, `conclusion`), text, epistemic status (`EMPIRICAL`, `EXTERNAL`, `ASSUMPTION`, `PROBABILISTIC`, `INTERPRETATION`, `UNRESOLVED`, `DERIVED`), provenance, and optional propositional AST with review state and an explicit interpretation. Node creation and its deriving edge are atomic in one transaction. Evidence links separately carry `SUPPORTED`, `DISPUTED`, `INSUFFICIENT`, `UNRESOLVED` assessments and provenance. A challenge can make the display disputed without altering its target.

An inference is a hyperedge: ordered premise IDs, separate assumption IDs, one conclusion ID, declared rule and provenance. A verification targets an edge, and stores `PROVEN`, `REFUTED` or `UNVERIFIED` for that conditional relationship. Unsupported mappings are marked non-formalizable in the projection. Proof artifacts are records, not authorization to run code.

## Empirical/formal boundary and Lean adapter

The generic core knows no Lean process. A `Verifier` accepts a validated graph and edge and returns a receipt. The adapter supports atoms, implication, conjunction and negation, with a bounded AST. It renames atoms to generated identifiers and emits only fixed templates for modus ponens, conjunction introduction/elimination and reiteration. No natural-language text, user tactic, import, identifier or raw proof source is interpolated into executable Lean.

Generated theorems have the shape `∀ (p q : Prop), (p → q) → p → q`. The relationship between a sentence and an atom is an explicit reviewed interpretation, not a Lean-verified semantic translation. A successful conditional can depend on empirical, disputed, probabilistic or assumed input. Inconsistent inputs are flagged; logical validity does not imply premises can all be true. REFUTED means a negation was checked from these same inputs; it does not establish real-world falsity. Limited search incompleteness is always disclosed.

Use a fresh private temporary directory, no shell, pinned toolchain, bounded process duration/output, memory and heartbeat limits, clean Lean search path, generated source only, cleanup on all exits. Require successful exit and an empty theorem axiom report; reject `sorryAx` and any undeclared axiom. Record source and exact runtime version; third parties regenerate and compile it. An exported success receipt is only a reported status until independently reproduced in the current verifier session.

## Agent surface

The SDK command dispatcher is the shared implementation for CLI, loopback HTTP and newline-delimited JSON-RPC MCP stdio (protocol 2025-11-25). Commands: OBSERVE, ASSERT, ATTACH, DECLARE, PROPOSE, CHALLENGE, VERIFY, TRACE, COMPARE, SUBSCRIBE, RENDER. Mutations require `expectedHead` to prevent lost updates. OBSERVE receives supplied text; it never autonomously fetches a URL. Atomic transactions may group dependent node/edge creation.

MCP provides tools and a `logosphere://graph` resource; resource subscription notifications expose head changes. Stdout is reserved for JSON-RPC; diagnostics go to stderr. File-backed MCP persists under an explicitly selected local directory. SDK subscriptions fire after successful commits. HTTP is deliberately limited to stateless verification; it is not a general unauthenticated graph database.

COMPARE reports exact structural differences under explicit correspondence; M1 does not claim a semantically minimal divergence set. A later solver must specify alignment, minimality and cost before making that claim.

## Browser observation and security

Click extension → dedicated inspector tied to that source tab → explicit Capture → temporary activeTab scripting access → selected text or bounded visible text nodes → scrub URL query/fragment → preview/edit → candidate extraction → explicit mapping acceptance → graph → optional loopback verification → dependency explorer → JSON export. A minimal service worker only opens the inspector on the toolbar click; it performs no observation, networking or storage. The inspector survives focus changes so a user can pair the local verifier without losing the graph. Source offsets always refer to the stored captured text, not to a future live page. Cross-origin frames, form fields, screenshots and off-screen documents are excluded. Private browsing is disabled. Source URLs are references, never automatically fetched.

The local service binds 127.0.0.1, validates Host and an explicitly configured extension Origin, requires a random per-start bearer token, limits request bytes and concurrent jobs, and accepts only validated artifacts. No wildcard CORS. The extension requests optional loopback host access only on verification, sends no token to webpage code, and keeps both captured data and token in extension memory. Tokens are paired manually. No unauthenticated remote access or raw Lean execution. The extension uses textContent, a restrictive CSP and no remotely hosted scripts. Clearing/closing the inspector forgets in-memory content; exported artifacts and explicitly persisted agent graphs contain the captured text and must be deleted by their owner when desired. Append-only history applies within retained artifacts, not a prohibition on privacy deletion.

## Repository

`packages/reasoning-core` schema, canonical hash, replay, validation, projections; `packages/verifier` generic interface and Lean adapter; `packages/observation` bounded DOM capture and conservative extraction; `packages/storage` atomic local graph snapshots; `packages/sdk` shared commands; `packages/agent-runtime` CLI, HTTP, MCP; `browser-extension` MV3 capture and inspector; `schemas` portable JSON Schema; `fixtures` inspectable example page/argument; `tests` invariants and real integration; `docs` contracts and setup; `scripts` reproducible build.

## Staged roadmap

**Milestone 0 — foundation:** recorded architecture and threat model; executable canonical schemas; immutable hash-linked transactions; provenance/reference/DAG/assumption validation; trace and challenge projections; local persistence with optimistic concurrency; tests and CI.

**Milestone 1 — honest vertical slice:** bounded page capture, conservative candidates with user review, generated Lean and actual kernel checks, proof receipts and independent recheck, complete declared dependency inspection, portable JSON export, CLI/SDK/MCP, functional extension and reproducible example. M1 is a developer preview, not public-store or hosted deployment.

**Milestone 2:** extraction benchmarks, richer editing and evidence assessments, scoped continuous observation with visible pause/stop and retention controls, accessibility-aware capture, browser end-to-end release suite, verified graph composition.

**Milestone 3:** signed/anchored artifacts, robust agent identity, semantic alignment and minimum divergence research, collaborative branching, optional isolated remote workers and additional verifiers. Publication/deployment requires its own release decision.

## Primary references consulted

- [Lean compilation and kernel boundary](https://lean-lang.org/doc/reference/latest/Elaboration-and-Compilation/)
- [Chromium activeTab user-gesture permissions](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
