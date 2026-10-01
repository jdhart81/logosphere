# Contributing

New here? Start with [one argument and one small improvement](docs/first-contribution.md).
A reproducible setup failure, ambiguous synthetic argument or confusing provenance
display is a useful contribution even before you write a patch.

Read `docs/architecture.md` and `SECURITY.md` first. Keep the reasoning core independent of the browser, storage transport and Lean process. Introduce new verifier implementations behind `Verifier`; extend the receipt schema with an explicit engine version when needed. Changes to portable artifacts require a versioned schema and migration/compatibility decision. Never mint a verification badge from an assertion or imported execution claim.

Use Node.js 24.20+ (Node 24 LTS recommended), the lockfile and the pinned Lean toolchain. Run `npm ci --ignore-scripts`, `npm test`, and `npm run demo`. Tests include actual Lean compilation and local loopback requests; they must not be replaced by mocked success. Update generated JSON Schemas when changing TypeScript schemas (`npm run build` does this). Do not commit private capture/export data, local stores, credentials, node_modules or build output.

Add tests that defend an architectural invariant or expose a meaningful failure. New extraction capabilities need ambiguous and adversarial language fixtures; new observation sources need explicit permission and retention tests. Distinguish unit/DOM simulation tests from real browser installation tests and kernel checks from real-world evidence.

## Sign your commits (DCO)

Pull requests from forks need a `Signed-off-by` line on every commit, matching the commit author's email:

    Signed-off-by: Your Name <you@example.com>

`git commit -s` adds it, and `git rebase --signoff origin/main` fixes an existing branch. Signing off
certifies the Developer Certificate of Origin 1.1 (https://developercertificate.org): you wrote the
change, or you have the right to submit it under this repository's license. The DCO check blocks
unsigned commits.

## License of contributions

Contributions are licensed under the same license as the files they change (see `LICENSE`), with no
additional terms. Don't submit work you can't license that way.

## Never commit

Credentials, API keys, private keys, `.env` files, customer or partner data, or wallet files. The secret
scan blocks known key formats. If you find a leaked secret, report it privately as described in
`SECURITY.md`.

## Names and marks

The license does not cover Viridis names, logos or certification marks. See `TRADEMARKS.md`.
