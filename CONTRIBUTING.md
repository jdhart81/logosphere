# Contributing

New here? Start with [one argument and one small improvement](docs/first-contribution.md).
A reproducible setup failure, ambiguous synthetic argument or confusing provenance
display is a useful contribution even before you write a patch.

Read `docs/architecture.md` and `SECURITY.md` first. Keep the reasoning core independent of the browser, storage transport and Lean process. Introduce new verifier implementations behind `Verifier`; extend the receipt schema with an explicit engine version when needed. Changes to portable artifacts require a versioned schema and migration/compatibility decision. Never mint a verification badge from an assertion or imported execution claim.

Use Node.js 24.20+ (Node 24 LTS recommended), the lockfile and the pinned Lean toolchain. Run `npm ci --ignore-scripts`, `npm test`, and `npm run demo`. Tests include actual Lean compilation and local loopback requests; they must not be replaced by mocked success. Update generated JSON Schemas when changing TypeScript schemas (`npm run build` does this). Do not commit private capture/export data, local stores, credentials, node_modules or build output.

Add tests that defend an architectural invariant or expose a meaningful failure. New extraction capabilities need ambiguous and adversarial language fixtures; new observation sources need explicit permission and retention tests. Distinguish unit/DOM simulation tests from real browser installation tests and kernel checks from real-world evidence.
