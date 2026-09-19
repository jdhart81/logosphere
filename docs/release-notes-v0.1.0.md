# Logosphere v0.1.0 M1 developer preview

Logosphere turns a bounded, explicitly supplied argument into an inspectable,
hash-linked reasoning graph and can verify supported conditional deductions with
a local pinned Lean kernel. The result is a portable graph artifact with source
spans, assumptions, challenges and reproducible proof receipts.

## Try it locally

Requirements are Node.js 24.20 or newer, npm, and elan with Lean 4.28.0.

```sh
git clone https://github.com/jdhart81/logosphere.git
cd logosphere
npm ci --ignore-scripts
elan toolchain install leanprover/lean4:v4.28.0
npm run first-use
```

The first-use command builds the project, runs a synthetic reservoir argument,
exports its artifact, and independently reproduces the proof receipt in a fresh
Lean process. It performs no cloud transmission and requires no account or API
key.

## Included

- Canonical, schema-validated and hash-linked reasoning artifacts.
- Explicit premises, assumptions, evidence assessments and non-destructive
  challenges.
- A restricted Lean adapter that generates fixed templates and never executes
  imported or user-supplied Lean.
- CLI, TypeScript SDK, MCP stdio and an opt-in Chromium extension.
- Local persistence, optimistic concurrency and independent receipt
  reproduction.
- An Apache-2.0 public source repository and a reproducibly packaged local
  extension.

## Boundaries

Lean verifies whether a declared conclusion follows from declared inputs. It
does not establish premise truth, source authenticity, evidence quality or the
correctness of the natural-language-to-symbol mapping. Imported proof receipts
remain reported until locally reproduced.

The extractor is deliberately conservative and is not a general argument
understanding system. There is no telemetry, model provider, hosted service,
account system, continuous browsing capture or browser-store distribution.
Captured or supplied text remains local unless the user exports it.

This is a developer preview, not a claim of research-grade extraction, public
deployment, empirical truth certification or verified external adoption.

## Feedback

Run the flow with synthetic or public text, then submit a
[first-use or repeat-use report](https://github.com/jdhart81/logosphere/issues/new?template=builder_trial.yml).
Report a useful result, an unclear result, or the first reproducible obstacle.
Do not attach private captures, graph stores, credentials or pairing tokens.
