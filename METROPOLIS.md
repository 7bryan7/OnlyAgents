# OnlyAgents — Metropolis build record

This file records work after the pre-Metropolis baseline. Product scope and setup live in [README.md](README.md); the detailed action log lives in [HISTORY.md](HISTORY.md). Planned items are not completed implementation.

## Evidence boundary

| Item | Value |
|---|---|
| Baseline date | 25 September 2026 |
| Baseline tag | `metropolis-baseline-2026-09-25` |
| Baseline commit | `2d48201ad984e4415481a6a2388ef77a14cf1391` |
| Development branch | `codex/metropolis-2026` |
| Target | Monad Testnet; zero spend; free-tier AI |

The tag points to committed code. The pre-existing staged `OnlyAgents` gitlink references the same commit and was not included or modified as part of this setup. The nested checkout is not the target workspace for this documentation refresh.

Baseline source already includes marketplace/dashboard, Gemini with simulation fallback, peer audits, global offchain metrics, six flagship personas/custom-agent support, SQLite with legacy JSON migration, WebSocket updates, swarm fan-out/synthesis, social feed, and Base Sepolia mint/escrow functionality. The earlier 18-agent/JSON prototype is historical context. These are not newly built Metropolis features.

## Status board

| Workstream | Status | Evidence needed |
|---|---|---|
| Scope/docs and Git baseline | Complete; locally verified 25 Sep 2026 | Four root docs; tag and branch both resolve to `2d48201` |
| Monad wallet/network integration | Planned | Network guards and verified testnet flow |
| Permissionless identity / ERC-8004 mapping | Planned | Interface tests, registration receipt, owner/metadata lookup |
| Execution commitments and audit attestations | Planned | Hash test vectors and confirmed lifecycle evidence |
| Capability reputation and auditor weighting | Planned | Score-change and abuse-control tests |
| Reputation-aware discovery/routing | Planned | Evidence-driven selection changes |
| Blockchain explorer and reputation timeline | Planned | Real event links and recovery states |
| Dynamic swarm extension | Planned | Registry selection, synthesis, per-agent proofs/audits |
| Free hosting and durable recovery | Planned | Restart/replay checks and working free demo |
| Submission package | Planned | Verified product, code, video, write-up, deadline |

## Build entries

### 2026-09-25 — Documentation foundation

- Change: replaced the old root README with Metropolis scope, preserved earlier completed prototype features, and reconciled source differences (six agents, SQLite, existing swarms/WebSockets, legacy Base Sepolia).
- Files: `README.md`, `AGENTS.md`, `HISTORY.md`, `METROPOLIS.md`.
- Reference: uncommitted documentation changes on top of baseline `2d48201`.
- Verification: source/route/script/config inspection; final documentation and Git checks recorded in `HISTORY.md`.
- Runtime/contract work: none. No dependency install, AI call, blockchain write, deployment, or publication performed.
- Next step: implement the identity/network milestone when requested, starting with contract interfaces, compatibility mapping, and local tests.

### 2026-09-25 — Baseline and branch verified

- Status: complete for local Git setup; documentation remains uncommitted.
- Change: created `metropolis-baseline-2026-09-25` at the existing baseline commit and switched to new branch `codex/metropolis-2026`.
- Verification: tag and branch HEAD both resolve to `2d48201ad984e4415481a6a2388ef77a14cf1391`; pre-existing staged `OnlyAgents` gitlink remains unchanged. Documentation link/anchor/fence/script checks and `git diff --check` passed.
- External side effects: none; refs were created locally, without push or publication.
- Next step: begin the first implementation milestone when requested; all protocol acceptance items remain unchecked.

### 2026-09-25 — Implementation comparison review

- Status: source review complete; application and live-network validation not performed.
- Scope: rechecked frontend routes, runtime/audit execution, routing, metrics, swarm selection/execution, persistence, wallet/network configuration, contracts, and tests against the Metropolis scope.
- Finding: existing application functionality is substantial, but no Monad identity/reputation/validation integration was found. Wallet/backend configuration still targets Base Sepolia. Existing NFT metadata hashing is not task/output execution proof. Existing global offchain scores and swarm synthesis require extension rather than reinvention.
- Baseline gaps to address: per-result live/simulated provenance; explicit self-audit rejection and duplicate influence; verified authorization; computed eligibility before routing; persistence of custom-agent token IDs and legacy escrow fields.
- Verification: an isolated Python SQLite in-memory check using the actual schema and task INSERT confirmed that supplied escrow fields are omitted on save; the agent schema lacks a tokenId column. Six legacy contract test cases exist, but were not run. Root dependencies are absent; no service, API, or blockchain calls were made.
- Build impact: no application code changed and no protocol milestone was marked complete. HEAD remains at the baseline; documentation is uncommitted. The nested folder is now absent from the working tree while its gitlink remains staged (`AD OnlyAgents`); this review made no change to that state.

## Deployment evidence

No Monad deployment is recorded. Root `deployed.json` belongs to the legacy Base Sepolia baseline and must not be presented as Monad evidence.

For each future deployment, record:

| Field | Required value |
|---|---|
| Date / network / chain ID | Actual deployment context |
| Source | Commit and compiler/settings reference |
| Contracts | Identity, reputation, validation/proof addresses as applicable |
| Transactions / blocks | Actual deployment hashes and block numbers |
| Verification | Explorer/source verification status and URLs |
| Lifecycle check | Registration/execution/audit evidence and test result |

## Acceptance tracker

- [ ] New wallet registers an agent on Monad Testnet and resolves owner/metadata/capabilities.
- [ ] Normal task produces a real free-tier model response with truthful provenance.
- [ ] Canonical commitments verify; altered task/output content fails verification.
- [ ] A different eligible auditor creates a confirmed attestation.
- [ ] Capability-specific reputation changes with a visible evidence breakdown.
- [ ] Updated evidence can change routing decisions.
- [ ] Self-audit and duplicate influence are blocked; reciprocal influence is reduced/flagged.
- [ ] UI links to real identity/audit events and handles pending/failed states.
- [ ] Evidence survives restart and indexing replays without duplicate scoring.
- [ ] Rate-limit fallback is explicit and simulated work is distinguishable.
- [ ] Optional swarm run attaches separate evidence to each contributor.
- [ ] Demo and infrastructure require no paid billing or purchased assets.
- [ ] Submission links and official cutoff are verified.

## Future entry template

```markdown
### YYYY-MM-DD — Milestone

- Status: planned / in progress / implemented / verified / blocked
- Change: what was newly built after the baseline
- Files/modules: affected paths
- Commit/reference: actual commit or uncommitted
- Verification: commands, outcomes, and evidence links
- Deployment: network/address/transaction, or none
- Limitations / next step: remaining acceptance work
```

Append build entries and update status/acceptance tables as evidence changes. Preserve earlier entries and append corrections. Never mark an unchecked item complete based only on the roadmap.
