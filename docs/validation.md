# Validation and release status

The local M0/M1 developer preview has passed its invariant suite, real browser integration and native consent/verification flow. No repository has been published, no hosted service deployed, and no browser-store submission made. CI is configured but has not been run on GitHub.

## Local verification receipt — September 8, 2026

- Strict build and automated suite: **38 passed, 0 failed, 0 skipped**.
- CLI demo: **PROVEN conditional deduction**; the premise remained UNRESOLVED and the conditional remained ASSUMPTION, with zero evidence assessments.
- Exported demo, automated-browser and native-browser receipts: **reproduced in fresh Lean processes**, including an independent CLI `check` invocation for the native-browser artifact.
- Current real Chromium integration: **passed**. Actual Capture button, exact source-tab binding, focus changes, preview/accept, HTTP/Lean verification, export, independent proof reproduction, import downgrade and session reset were exercised. Its test installation pregrants loopback access; native consent was tested separately below.
- Runtime: Node.js 20.20.2; Lean 4.28.0, commit `7e01a1bf5c70fc6167d49c345d3bf80596e9a79b`, macOS arm64; Playwright 1.63.0 with its isolated Chromium build.
- Unchanged-manifest native Chromium checks: extension toolbar launches the dedicated inspector; no automatic capture; explicit selection capture returns exactly the three synthetic argument paragraphs (159 characters); preview/accept preserves the unresolved premise and explicit assumption; denying the loopback permission leaves the graph intact.
- Native **Allow**: **passed after explicit user authorization** for the isolated extension's `http://127.0.0.1/*` access. The unchanged package displayed Chrome's native permission sheet; Allow led to actual local Lean execution and a PROVEN deduction with its premise still UNRESOLVED and its assumption still explicit.
- Native inline premise challenge: **passed**. Appending a calibration-evidence challenge produced `PROVEN · DISPUTED`, preserved the original proof/history, and survived export and independent recheck.
- Native Forget/import/reverify: **passed**. Forget cleared the graph and token. Import displayed `UNVERIFIED · DISPUTED` with a reported PROVEN receipt; a wrong token returned 401 without establishing a proof; correct pairing reverified the graph while retaining its challenge. Closing/reopening the inspector returned to an empty session with observation off.
- Native export head: `sha256:80a4ae6531b928663a0b910b863bdd2bc8e099bc265a937dcefc2218939dbcea`; 3 nodes, 1 edge, 1 receipt, 1 challenge. The source is a 159-character synthetic fixture, not empirical evidence. Local file: `artifacts/native-browser-export.json` (intentionally excluded from Git).
- Cleanup: the test verifier was stopped and its temporary native profile, including the granted permissions, was removed. The ordinary browser profile was not used.

The earlier automatic approval rejection was respected until the user explicitly approved the local permission scope; it is now resolved. The current integration run also fixed the harness's exact-URL lookup: Chromium tab filters accept URL patterns, so the test now matches the observed URL against the tab inventory instead of treating its fragment as a filter pattern. Browser binaries were reused from `/private/tmp/logosphere-browser-cache` via `PLAYWRIGHT_BROWSERS_PATH`; a fresh setup can use the standard install command below. Demo artifacts have fresh UUIDs/timestamps on each run and therefore different heads.

## Automated checks

`npm test` runs strict TypeScript compilation, the packaged extension build, generated JSON Schema export, and unit/integration tests. Actual Lean 4.28.0 is required. The suite covers:

- canonical hash determinism, tampering, missing provenance and mismatched source slices;
- explicit assumptions, orphan conclusions, reference integrity, cycles, maximum dependency depth and non-destructive challenges/branches;
- multi-step extraction and real verification, unresolved circular prose, full declared traces and source/evidence/receipt challenges;
- real Lean success, invalid inference, direct conditional refutation, every supported template, missing binary, timeout and safe regeneration of imports;
- independent receipt reproduction with the pinned toolchain/commit;
- private atomic snapshots, restart loading, stale write conflicts, corruption, orphan recovery and bounded UTF-8 reads;
- SDK queue isolation, no publication after failed persistence, agent/human object symmetry and subscriptions;
- MCP methods, request metadata, resources, notifications and a real newline-delimited stdio process;
- HTTP host/origin/token checks, payload limits and actual Lean through the loopback bridge;
- DOM privacy exclusions, selected-range boundaries, inline markup, capture limits, manifest permissions and packaged inspector interactions under a DOM test harness.

Run the real Chromium integration separately when its isolated local-access scope is authorized:

```sh
npx playwright install chromium
npm run test:browser
```

The test creates a temporary browser profile and extension installation. Its copied manifest pregrants optional loopback access; the production manifest remains unchanged. It clicks the actual Capture button on a synthetic webpage, checks the inspector's source-tab binding, sends the artifact to real local HTTP/Lean verification, exports and independently reproduces the proof, checks imported-status downgrade, and clears the session. Pregranted permissions do not test native consent and must not be used to bypass a rejected permission request. The test needs port 4318 free and produces `artifacts/browser-export.json` and `artifacts/extension-preview.png`. All data is synthetic.

## Native browser release checklist

Use the unchanged `dist/extension` package in a fresh visible Chromium profile. The M1 native results above cover the central capture/consent/proof/challenge/export flow. This broader checklist remains useful for future browser releases; it is not a claim of exhaustive page, platform or accessibility coverage:

1. Load the unpacked extension; check manifest/CSP errors. Activate its toolbar action. Verify no text is captured before clicking Capture.
2. Select the three fixture argument paragraphs. Check exact text, omission of private/editable/hidden sentinels, and stripped query/fragment.
3. Exercise viewport capture, no selection, empty/restricted pages, huge pages, hidden ancestors, nested/editable areas and unsupported iframes.
4. Preview and accept mappings; inspect the separate assumptions and unresolved premises. Switch to a terminal and back: the graph must survive.
5. Pair the verifier; deny permission and confirm the graph remains usable. In an authorized fresh test, grant local access and verify Lean. Test wrong token, origin and stopped service.
6. Open the inline challenge editor, submit a premise/source/formalization challenge, and inspect retained history and downstream dispute status.
7. Export, close and reopen to confirm the session is gone. Import to confirm reported proofs stay unverified until reproduced.
8. Confirm keyboard navigation, long-text wrapping and no network requests except explicit local verification.

Public distribution also needs extension-store review, privacy disclosure review, an owner-configured private security-reporting channel and an explicit publication decision. M2/M3 roadmap items are outside the requested M0/M1 implementation scope.
