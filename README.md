# Logosphere

**Inspectable reasoning graphs with reproducible, conditional Lean verification.**

[**Run the local demo**](#quick-start) ·
[Make a first contribution](docs/first-contribution.md) ·
[Share a first-use or repeat-use report](https://github.com/jdhart81/logosphere/issues/new?template=builder_trial.yml)

Information → explicit logic graph → verification → canonical reasoning artifact → human/agent projections.

Logosphere makes the declared reasoning inspectable. Lean checks whether a conclusion follows from specified hypotheses. Source authenticity, premise truth, evidence quality and the interpretation of natural language are separate questions. The system can leave them unresolved.

This repository implements **Milestone 0 (foundation)** and **Milestone 1 (bounded developer preview)**. It includes a Chromium extension, a local Lean verifier, a TypeScript SDK, a CLI, MCP stdio, hash-linked graph history and portable JSON artifacts. The invariant suite, real browser integration, native permission flow and independent Lean reproduction have passed locally. It does not provide general-purpose argument understanding or continuous browsing observation yet. See the [acceptance matrix](docs/acceptance.md) and [validation record](docs/validation.md) for the exact tested scope.

## Quick start

Requirements: Node.js 24.20 or newer (Node 24 LTS recommended; `.nvmrc` pins the tested version), npm, and [elan](https://github.com/leanprover/elan). Initial dependency/toolchain installation requires internet access; the demo and verifier operate locally afterward. No API keys, model provider, account or database service is required.

```sh
git clone https://github.com/jdhart81/logosphere.git
cd logosphere
npm ci --ignore-scripts
elan toolchain install leanprover/lean4:v4.28.0
npm run build
npm test
npm run demo
```

Tests require permission to open a temporary loopback port and execute Lean. They fail if the real Lean integration is unavailable; there is no simulated proof fallback. esbuild's platform executable is installed as a locked optional package; lifecycle scripts are not needed on supported macOS/Linux platforms.

The demo writes `artifacts/demo.json` and `artifacts/Proof.lean`, then reproduces the proof in a fresh Lean process. Its synthetic example is:

```text
Assumption: If the sensor reading is accurate, then the reservoir level is low.
Premise: The sensor reading is accurate.
Therefore: The reservoir level is low.
```

Expected result: **PROVEN conditional deduction**, an **UNRESOLVED** sensor premise, an explicit **ASSUMPTION**, and **no evidence assessments**. This says nothing about an actual reservoir.

```sh
node dist/packages/agent-runtime/src/cli.js check artifacts/demo.json
node dist/packages/agent-runtime/src/cli.js ingest fixtures/argument.txt artifacts/my-argument.json --accept-formalization
node dist/packages/agent-runtime/src/cli.js inspect artifacts/my-argument.json
```

`--accept-formalization` records review of the proposed symbolic interpretation. Omit it to preserve candidate mappings as proposed and leave verification unestablished. Inspect the mappings before accepting them. The demo accepts its predeclared synthetic mapping explicitly.

## Try the browser extension

1. Run `npm run build`. In Chromium's Extensions page, enable Developer mode and load the unpacked `dist/extension` directory.
2. Copy the extension ID shown there. Start the local verifier with the corresponding origin:

   ```sh
   LOGOSPHERE_EXTENSION_ORIGIN=chrome-extension://YOUR_EXTENSION_ID npm run serve
   ```

3. The service prints a temporary pairing token. Open an HTTP/HTTPS webpage, select a bounded argument when possible, and click the extension's toolbar action. Its inspector opens in a separate window tied to that source tab. Click **Capture visible text**.
4. Review/edit the capture. Click **Preview candidate graph**, inspect the sentences and symbol mappings, then **Accept mapping and build graph**.
5. Open **Connect a local Lean verifier**, paste the token, and click **Verify with local Lean**. Grant optional loopback access if prompted.
6. Follow the premise/assumption links, expand provenance, inspect generated Lean and receipts, append a challenge, and **Export reasoning artifact**.

For a controlled page, serve the fixture locally in a second terminal:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory fixtures
```

Open `http://127.0.0.1:8765/argument.html`. You can also use **Load synthetic example** in the inspector without capturing a page.

The inspector keeps data in memory and survives window switching. Closing it forgets the session; export before closing. Edits are attributed as supplied text and omit the page URL. Browser screenshots, inputs, editable elements, hidden content, cross-origin frames, query strings and fragments are not collected. A visible text node can contain text extending beyond the viewport; the total capture is always bounded. Capture is a snapshot, not a live page citation.

Create a local installation archive with `npm run package:extension` (requires `zip`). It writes `releases/logosphere-0.1.0-extension.zip` and a checksum manifest with the source commit, file hashes and archive hash. Extract the archive into a directory and select that directory with Chromium's **Load unpacked**. Packaging performs no installation or publication. Third-party license notices are included. See [local release instructions](docs/releasing.md).

## API and agents

The shared runtime exposes OBSERVE, ASSERT, ATTACH, DECLARE, PROPOSE, CHALLENGE, VERIFY, TRACE, COMPARE, SUBSCRIBE and RENDER. Both human and agent actors use the same objects. Mutations require the current `expectedHead`; a stale write is rejected.

```js
import { Runtime } from './dist/packages/sdk/src/index.js';
import { LeanVerifier } from './dist/packages/verifier/src/index.js';

const runtime = new Runtime({ id: 'agent:researcher', kind: 'agent' }, new LeanVerifier());
const unsubscribe = runtime.subscribe(change => console.error(change.head));
await runtime.dispatch({
  action: 'OBSERVE', expectedHead: null, title: 'Supplied argument',
  text: 'Assumption: If P, then Q. Premise: P. Therefore: Q.',
  acceptFormalization: false,
});
const artifact = runtime.export();
unsubscribe();
```

For MCP, configure a stdio server with an **absolute** path to `dist/packages/agent-runtime/src/mcp.js`:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/logosphere/dist/packages/agent-runtime/src/mcp.js"],
  "env": { "LOGOSPHERE_STORE": "/absolute/private/path/logosphere-store", "LOGOSPHERE_ACTOR": "agent:researcher" }
}
```

This is a generic server entry; wrap it in your client's MCP configuration format. The canonical resource is `logosphere://graph`; it supports change subscriptions. Read it to obtain the current head and immutable IDs. Run the Node file directly for MCP: npm's wrapper writes extra text and should not be used as the MCP executable. [Protocol and command examples](docs/protocol.md).

## Artifact and verification guarantees

- Canonical artifacts contain schema-validated, hash-linked append-only transactions. Prose is generated from the graph.
- Every object has provenance; event envelopes preserve who/what created it and when. Source quotations are checked against stored text. Declared actor identities are not cryptographically authenticated.
- Inference edges have explicit premises and assumptions. Conclusions cannot exist without dependencies; inference cycles and dangling references are rejected.
- Challenges and branches preserve history. Evidence assessments and reported formal receipts never rewrite node epistemic categories.
- Imported receipts are **reported**, not trusted. Reverification regenerates safe Lean from the graph and runs the pinned compiler. It never executes an imported source file.
- M1 proves one declared edge at a time. A downstream edge may assume a derived premise; inspect its full trace and upstream receipts. No single composed proof of an entire arbitrary graph is claimed.
- Hashes detect tampering relative to a known head. They do not authenticate sources/authors, provide public timestamp anchoring, or prevent someone from rewriting and rehashing an entire unanchored history.

## Current limits and next steps

The extractor recognizes explicit conditional/matching-premise/conclusion patterns, including chains rooted in an explicit premise. Circular claims without a root stay unresolved. It retains at most 24 candidate sentences per capture; every source keeps the bounded captured text, and the inspector warns when sentences were omitted. It does not infer missing assumptions. Other text stays unresolved. Lean supports reviewed propositional atoms, conjunction, implication and negation through five fixed rules. Unsupported rules, failed attempts, unavailable Lean and timeouts remain unverified. Direct negation is the limited supported conditional-refutation path. Evidence quality is a recorded assessment, never an automatic source truth claim.

COMPARE reports exact object differences, including evidence and challenges; it does not compute a semantically minimal divergence set. Continuous observation, screenshot capture, model-backed extraction, signing, collaborative accounts, rich semantic alignment, public hosting and browser-store release are later milestones.

[Architecture, invariants and roadmap](docs/architecture.md) · [Protocol](docs/protocol.md) · [Security and retention](SECURITY.md) · [Validation and release checklist](docs/validation.md) · [Contributing](CONTRIBUTING.md)

Apache-2.0. See [LICENSE](LICENSE).
