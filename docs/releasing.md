# Reproducible local delivery

The repository and installation archive are a local developer preview. Packaging, Git commits and local tags do not publish to GitHub, a browser store or a hosting service. Consult the current [validation record](validation.md) before making a release claim.

## Rebuild and verify

Use macOS or Linux with Node.js 20.19+, npm, elan and `zip`:

```sh
npm ci --ignore-scripts
elan toolchain install leanprover/lean4:v4.28.0
npm test
npm run demo
node dist/packages/agent-runtime/src/cli.js check artifacts/demo.json
npm run package:extension
```

`releases/logosphere-0.1.0-extension.zip` contains only the extension's allowlisted build files and license notices. `releases/logosphere-0.1.0-checksums.json` records the Git revision and raw-byte SHA-256 hashes of the archive and each entry. Archive entry order and timestamps are fixed; identical build output on the same packaging toolchain produces the same ZIP bytes. Different `zip` implementations may encode different metadata/compression, so the file hashes are the portable content check. These package checksums hash raw bytes, unlike the reasoning protocol's canonical-JSON hashes.

Extract the ZIP into a directory. On Chromium's Extensions page, enable Developer mode, choose **Load unpacked**, and select that directory. Follow the [README](../README.md) for local pairing and the [native checklist](validation.md) for consent testing. Neither an archive nor a checksum is evidence that a proof was checked: use the artifact's independent verification command.

## Portable Git repository

A local bundle can preserve the complete committed source and refs without publishing:

```sh
git bundle create releases/logosphere-0.1.0.bundle --branches --tags HEAD
git bundle verify releases/logosphere-0.1.0.bundle
```

Only project branches, tags and HEAD are included; local editor/tool snapshot refs are excluded. On another machine, copy the bundle and clone it:

```sh
git clone logosphere-0.1.0.bundle logosphere
cd logosphere
```

Then use the locked setup above. Generated artifacts, private graph stores, installed dependencies and pairing tokens are excluded from Git. A remote repository, CI execution on that remote, browser-store distribution and hosted deployment each need their own explicit publishing decision.
