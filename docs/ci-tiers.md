# Fleet CI v2

Required hosted checks remain `test (22)`, `test (26)` and `codeql`.
This supersedes the routing approach in PR #17: quick PR validation stays hosted,
while exhaustive main/nightly validation uses `pm-local-arm64` (Pi) runners.
PR #17 remains open for the owner. No repository variable is changed here.

| Check | Code PR 22 | Code PR 26 | Docs/tracker PR, both | Deep 22 + 26 |
| --- | --- | --- | --- | --- |
| npm ci | yes | yes | yes | yes |
| Authoritative tracker health, identity/private-path policy | yes | yes | yes | npm + Bun |
| Strict CLI pm health | — | — | yes | covered by authoritative SDK health |
| Changelog consistency | — | gate | yes | npm + Bun |
| Public package file inventory | — | gate | yes | npm + Bun |
| Documentation/privacy and identity regression suites | suite | suite | yes | npm + Bun |
| Build, typechecked tests and unit/model suites | quick | quick coverage | build for inventory | full npm + Bun |
| Typecheck, lint, zero duplication, full docstrings | — | gate | — | npm + Bun |
| Coverage: 100% statements/branches/functions/lines | — | quick | — | full npm + Bun |
| Production audit, publish attestation verifier | — | gate | — | npm + Bun |
| Packed npm/Bun, npx/bunx and native SDK acceptance | — | gate | — | npm + Bun |
| Behavioral revert probes (including docs mutations) | — | gate | docs assertions above | npm + Bun |
| Bun package graph install | — | yes | — | yes |
| CodeQL | all PRs, separate workflow | separate workflow | yes, required and unfiltered | main pushes and weekly scan |

Quick uses the first 50 of the original 500 operation sequences with identical
random generation, alphabet and per-case assertions. Counters begin at zero and
replay/refusal minimums derive from generated sequences. Unset depth remains full.
Coverage thresholds and source inventories are unchanged. The finite privacy
adversarial corpus keeps twelve iterations and scales its 500ms CPU harness
budget, retaining the start-anchor mutation proof on slow hardware. Scaled child watchdogs validate positive finite factors
before spawning and round to integer milliseconds; product budgets stay literal.

The cheap path includes `review.test.ts`, which reads README, ARCHITECTURE and
docs/real-data.md, the identity tests/gate and actual package file inventory.
Executable tracker files always select the code path. Packed acceptance already
proves Bun package installation and bunx local CLI/extension activation, alongside
npm/npx and native SDK reads, so only a Bun graph install is added after the gate.

PR CI runs on pull requests and dispatch, cancels superseded PR runs and caps
jobs at 25 minutes. Deep runs on main pushes, dispatch and daily at 02:19 UTC,
separate from the 05:37 release, hourly :41 reconciliation and Monday 01:47
CodeQL schedule. Distinct `deep (22)`/`deep (26)` jobs each retain full npm and Bun
release gates with `PM_TEST_DEPTH=full`, `PM_TEST_TIME_SCALE=3` and a 120-minute
limit. Per-ref cancellation bounds obsolete work. Persistent local npm caches
and preinstalled Bun avoid remote cache/setup downloads; `PM_LOCAL_DEEP=off`
selects hosted Ubuntu. CodeQL keeps its weekly scan and has a 30-minute timeout.

Baseline main run 43653447844: Node 22 45m48s created-to-completed (2m execution);
Node 26 54m52s (4m10s execution). The owner fleet measurement was 39,929 runner
minutes/day and median PR wall time 45–90m with about 28m queueing. Full depth is
not run locally; deep CI certifies it after merge. Local and hosted timings use
different hardware and cannot establish a controlled speedup ratio.
