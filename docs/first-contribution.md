# Try one argument, improve one step

Start with the [README quickstart](../README.md#quick-start). Use the synthetic
reservoir example before connecting a browser. The demo should produce a
conditional deduction while keeping the sensor premise unresolved. See the
[validation record](validation.md) for the tested scope.

Then choose one small contribution:

- **A confusing setup step:** record your environment, the exact command, and the
  first error. Propose one documentation correction after reproducing it.
- **An ambiguous argument:** supply a short synthetic text and explain the mapping
  you expected. An unsupported argument should remain unresolved; do not weaken
  that behavior just to obtain a proof result.
- **A confusing provenance display:** describe which assumption or source you
  could not trace and provide reproduction steps with synthetic input.

[Report your first or repeat use](https://github.com/jdhart81/logosphere/issues/new?template=builder_trial.yml).
You do not need to implement a feature to contribute. A reproducible obstacle is
useful. Before writing code, check existing issues and follow
[CONTRIBUTING.md](../CONTRIBUTING.md), including the real Lean checks.

For maintainers: reproduce the report, identify the smallest fix, and link the
change back to the report. Treat an external report of a useful result, a return
for a different task, and a contribution as separate observations. Internal demo
runs, stars and clones do not establish those outcomes.
