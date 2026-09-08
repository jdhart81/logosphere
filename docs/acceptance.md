# Specification acceptance matrix

The initial delivery implements the requested Milestone 0 and Milestone 1. Later platform ambitions remain staged in [architecture.md](architecture.md). The authoritative execution record, including incomplete native browser checks, is [validation.md](validation.md).

## Ten architectural invariants

| Invariant | Enforcement | Regression coverage |
|---|---|---|
| 1. Graph primacy | Artifact admits only graph events; RENDER takes a graph/node/head | `core.test.ts`, `runtime.test.ts` |
| 2. Provenance | Required provenance and actor/time envelope, immutable IDs, exact source slices/hashes | `core.test.ts` |
| 3. Explicit assumptions | Separate kind/status and edge input list; cannot silently become premises | `core.test.ts`, `verifier.test.ts` |
| 4. Formal/evidential separation | Edge receipt never changes node epistemic category or evidence assessments | `verifier.test.ts`, `completion.test.ts` |
| 5. Traceability | DAG validation, declared dependencies, evidence/source/receipt closure, depth limit | `core.test.ts`, `completion.test.ts` |
| 6. Non-destructive challenge | Append-only exact-target challenges, replacement references and explicit branches | `core.test.ts`, `completion.test.ts` |
| 7. Reproducibility | Safe regeneration, source/input hashes, runtime commit, invocation and fresh Lean execution | `verifier.test.ts`; `npm run demo`; CLI `check` |
| 8. Agent/human symmetry | Same schemas and command dispatcher, attribution in events | `runtime.test.ts`, `cli.test.ts` |
| 9. Privacy by architecture | User-click capture, 12,000-character bound, exclusions, transient inspector, optional paired loopback | `browser.test.ts`, `server.test.ts`; partial native checks |
| 10. No false certainty | Unsupported prose/mappings remain unresolved; proof failure never means refutation | `core.test.ts`, `verifier.test.ts`, `completion.test.ts` |

Tests live under `tests/`. Provenance identifies a declared creator; it does not authenticate them. A complete trace covers the graph's declared chain; extraction cannot guarantee discovery of every unstated assumption.

## Ten MVP operations

| Requested operation | Implementation | Validation boundary |
|---|---|---|
| 1. Observe a bounded webpage region | Toolbar inspector + explicit selection/viewport capture | Native synthetic selection and DOM boundary tests pass |
| 2. Extract candidate claims | Conservative local parser, bounded sentences, retained unmodeled source text | Explicit and ambiguous fixtures pass; no general NLP claim |
| 3. Construct a graph | Validated atomic node/edge event batches | Hash/provenance/reference invariants pass |
| 4. Expose premises and assumptions | Separate node cards, edge links, full backward trace | Packaged UI tests and native inspection pass |
| 5. Identify formalizable relationships | Reviewed propositional AST plus supported rules | Proposed/unsupported mappings are rejected for proof |
| 6. Generate Lean | Fixed templates with generated names only | All five rule templates compile in real Lean |
| 7. Execute verification | Local resource-bounded Lean adapter and authenticated bridge | CLI, SDK and HTTP tests pass; native Allow flow pending |
| 8. Associate proof status with graph | Bound immutable verification receipt, session reproduction status | Formal/evidential and import-downgrade checks pass |
| 9. Inspect complete dependencies | Linked inspector cards, trace, provenance, evidence and challenge history | Packaged UI tests pass; remaining native checklist documented |
| 10. Export structured reasoning | Canonical JSON artifact; independently regenerate and recheck proofs | CLI export/reproduction passes; current full browser integration pending |

## Foundation and delivery

The repository includes strict TypeScript modules, versioned JSON Schemas, a pinned Lean toolchain, locked npm dependencies, Apache-2.0 licensing, third-party notices, a reproducible extension archive script, a synthetic example, CI configuration, a local graph store, and an SDK/MCP surface for all eleven requested agent actions.

The formal core deliberately verifies individual declared edges. Multi-step arguments expose every intermediate edge and its receipt; there is no unqualified whole-graph truth badge. COMPARE returns structural differences including attribution and evidence. It does not claim semantic equivalence or the minimum divergence set. Continuous observation, screenshot capture, remote models, public accounts, signatures/anchoring, richer formal systems and public deployment remain subsequent milestones.
