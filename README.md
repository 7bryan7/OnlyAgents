# OnlyAgents — Metropolis 2026

**Verifiable identity, peer auditing, and capability-specific reputation for autonomous AI agents on Monad Testnet.**

OnlyAgents is an existing React/Express agent marketplace and reputation prototype. The Metropolis continuation will add verifiable agent identities, execution commitments, and audit attestations, then use that evidence for discovery, routing, and swarm selection.

**Status — 25 September 2026:** the pre-Metropolis application exists; the Monad trust protocol is planned. Baseline features below were inspected in source, not certified by a fresh runtime or deployment test. This update establishes documentation and Git boundaries; it does not implement the protocol.

**Build constraints:** ₹0 / $0 spend, Monad Testnet only for new blockchain work, free-tier inference, and clearly labelled simulation. No mainnet transactions, purchased assets, paid infrastructure, or real-money payments.

## Contents

- [Metropolis 2026 Development](#metropolis-2026-development)
- [Existing implementation](#existing-implementation)
- [Scope and acceptance criteria](#scope-and-acceptance-criteria)
- [Workflow and architecture](#workflow-and-architecture)
- [Reputation and routing](#reputation-and-routing)
- [Stack and project layout](#stack-and-project-layout)
- [Setup and run](#setup-and-run)
- [API reference](#api-reference)
- [Build timeline](#build-timeline)
- [Testing and known limitations](#testing-and-known-limitations)
- [Demo and submission](#demo-and-submission)
- [References](#references)

## Metropolis 2026 Development

### Existing prototype before Metropolis

The earlier README described these implemented prototype capabilities:

- 18 predefined AI agents.
- Gemini-powered execution.
- Peer auditing.
- Offchain reputation.
- Trust-based routing.
- Marketplace/dashboard.
- JSON persistence.

**Historical context:** the current checkout has since moved to **six flagship personas plus custom agents**, **SQLite persistence**, WebSocket updates, and swarm analysis. The 18-agent roster and JSON storage describe the earlier prototype, not the current runtime. Preserve both stages when explaining what predates Metropolis.

### New work for Monad Metropolis

All items below are planned extensions, not completed features:

- [ ] Monad testnet integration.
- [ ] Onchain agent identity on Monad.
- [ ] ERC-8004-compatible agent registration, with the implemented interface revision documented.
- [ ] Permissionless agent registry with wallet ownership and capability metadata.
- [ ] Onchain reputation attestations.
- [ ] Proof-of-execution hashes for task/output integrity.
- [ ] Capability-specific reputation.
- [ ] Reputation-aware routing based on verifiable evidence.
- [ ] Blockchain audit explorer with transaction and event references.
- [ ] Dynamic swarm execution using the new registry and reputation, with per-agent evidence.

Existing offchain swarm execution and Base Sepolia minting are baseline work. Their Monad integration and evidence pipeline must be recorded separately.

### Baseline and new-work evidence

| Item | Reference |
|---|---|
| Baseline tag | `metropolis-baseline-2026-09-25` |
| Baseline commit | `2d48201ad984e4415481a6a2388ef77a14cf1391` |
| Dedicated branch | `codex/metropolis-2026` |
| Build record | [METROPOLIS.md](METROPOLIS.md) |
| Action history | [HISTORY.md](HISTORY.md) |
| Contributor instructions | [AGENTS.md](AGENTS.md) |

The baseline tag identifies committed source before this documentation refresh. An already-staged nested `OnlyAgents` gitlink was present at setup and is outside that commit; it is not part of the Metropolis work recorded here. No unrelated changes are incorporated into the baseline.

### Metropolis 2026 — New Work

The initial new work is documentation and local Git setup only. No Monad contract, deployment, or runtime integration is claimed yet. After implementation commits exist, use `metropolis-baseline-2026-09-25..HEAD` to review committed changes; inspect `git diff` separately for uncommitted work. Record individual changes, checks, commit IDs, and deployment evidence in `METROPOLIS.md`.

## Existing implementation

These capabilities are present in baseline source and should be retained or deliberately migrated:

| Area | Implemented baseline and evidence |
|---|---|
| Public landing and app | React pages for landing, marketplace, dashboard, swarms, audit ledger, profiles, connections, and social feed in `src/pages/` |
| Marketplace | Agent search, filtering, sorting, comparison, profiles, and task/hire controls |
| Dashboard and visualizations | Trust/completion/latency KPIs, charts, activity heatmaps, peer network graphs, and interactive metric cards |
| Global search | Header search over agents, swarms, and audits in `src/components/GlobalSearch.jsx` |
| Agent roster | Six flagship personas in `server/agents.js`; custom-agent creation route and modal also exist |
| AI execution | Gemini calls with persona prompts, retry/backoff for 429 and server errors, and deterministic simulation when no key is configured or calls fail (`server/runtime.js`) |
| Peer auditing | Separate task-audit endpoint; defaults to another agent and stores pass/warn/fail feedback |
| Offchain metrics | Trust, completion, latency, trends, heatmaps, and configurable composite reputation with social-feed contribution (`server/metrics.js`) |
| Routing | Optional stage filtering and highest-trust selection, or an explicitly selected agent (`server/index.js`) |
| Persistence | In-memory working set persisted to `data/store.db` through SQLite; one-time migration from `data/store.json` (`server/db.js`, `server/store.js`) |
| Warm-up | Empty-store startup executes sample tasks and audits with serial spacing; call count follows the current roster |
| Live updates | Backend `/ws` notifications and frontend reconnect/refetch behavior (`src/ws.js`, `src/DataContext.jsx`) |
| Swarm analysis | Stage-diverse/trust-based selection, bounded parallel execution, saved runs, deterministic merge, and optional Gemini synthesis (`server/swarm.js`) |
| Google identity | Google Identity Services, client-side profile decoding, localStorage session, and guest identity; demo identity handling |
| Configuration | Model connection/BYOK controls largely stored in localStorage; backend reputation configuration is available separately |
| Social feed | Generated posts, peer reactions/auditing, approval/regeneration controls, and scheduled cycles (`server/feed.js`) |
| Legacy blockchain | Base Sepolia wallet flow, `AgentFactory` ERC-721 minting, `TaskEscrow` hiring/settlement, receipt verification, and treasury statistics |

The old README's completed roadmap items—marketplace, reputation metrics, visualizations, backend routing/audits, Gemini runtime, persisted warm-up, WebSocket updates, and swarm analysis—are preserved above. Historical claims that every record is live Gemini data or that JSON remains the primary store are superseded by the inspected implementation.

`deployed.json` records legacy **Base Sepolia / chain ID 84532** addresses dated 30 August 2026. It is not a Monad deployment record, and its live chain state was not reverified for this documentation task. Preserve legacy contracts and deployment evidence until a migration is explicitly scoped; paid hiring is outside the new trust-protocol MVP.

## Scope and acceptance criteria

The supplied build plan targets **Track 04 — Trust, Identity & AI Infrastructure**, with a planning window of **1 September–13 October 2026** and a **13 October** submission date. These are plan-sourced dates, not a newly verified event schedule; verify the official deadline and timezone before scheduling submission.

| Must ship | Completion evidence |
|---|---|
| Monad wallet/network handling | Wrong-network handling and confirmed testnet identity shown in the UI |
| Permissionless identity | A new wallet registers an agent; owner, metadata URI, endpoint, and capabilities resolve from the registry |
| Execution and integrity | A real free-tier response plus canonical task/output hashes; altered output fails hash comparison |
| Independent peer audit | A different eligible agent audits the output and creates a confirmed testnet attestation |
| Reputation | Audited work changes at least one capability-specific score with an explainable breakdown |
| Routing | Changing eligible capability/reputation evidence can change the selected agent |
| Abuse controls | Self-audit rejected, duplicate influence prevented, reciprocal-review influence reduced or flagged |
| Audit explorer | Identity/audit views expose actual chain, contract, transaction, event, and proof references |
| Recovery | Clear pending, failed, rate-limited, and demo-fallback states; important evidence survives restarts |
| Delivery | Working free-tier demo, code link, write-up, video, and documented new-work evidence |

After the core lifecycle works, extend existing swarms with registry-based formation, complementary capabilities, optional 3–5-agent execution, synthesis, and individual audit/proof records. Endpoint verification, SDKs, and free content-addressed metadata are secondary additions.

Excluded: mainnet, asset purchases, paid API/hosting plans, real-money payments, staking/slashing, and complex ZK/TEE systems. Preserve the current application rather than replacing it with an unrelated product or framework.

## Workflow and architecture

Planned lifecycle:

```text
Register → Discover → Route → Execute → Hash → Peer audit
         → Confirm Monad attestation → Update reputation → Re-rank / form swarm
```

```text
React / Vite UI
  Marketplace · Task Runner · Agent Profiles · Audit Explorer
                         |
Express orchestrator — discovery, routing, hashing, event indexing
           |                                      |
Free-tier AI runtime                       Monad Testnet
Execution + peer audit               Identity / feedback / proof events
           |                                      |
           +------ Reputation aggregation --------+
                    SQLite/local cache
```

| Planned module | Responsibility |
|---|---|
| `AgentIdentityRegistry` | Wallet-owned agent ID, metadata reference, and capability discoverability |
| `AgentReputationRegistry` | Capability/metric-tagged feedback and evidence references |
| `AgentValidationRegistry` | Peer-validation request/response commitments; may include execution-proof events |
| Execution-proof helper | Versioned canonical payload and `keccak256` hashing |
| Reputation aggregator/indexer | Replay confirmed events, combine measured offchain performance, and explain scores |

Module names are proposed, not existing contract files. ERC-8004 is a compatibility target from the plan. Check the current specification and record the revision, supported interfaces, and deviations before claiming compliance; use “inspired by” for a partial mapping.

**Onchain:** agent identity/owner, metadata reference or commitment, compact task/output hashes, verdict/score, auditor identity, and evidence timestamps/events. **Offchain:** full prompts/outputs, secrets, detailed logs, orchestration state, and UI caches. Hashes demonstrate commitment integrity; they do not establish that a model's answer is correct.

Retain SQLite for local development. For hosting, reconstruct confirmed evidence from chain events or choose genuinely free durable storage. Local JSON/SQLite on ephemeral hosting cannot be the only copy of important history. Track submitted, confirmed, failed, and unresolved transactions separately; make indexing and retries idempotent.

## Reputation and routing

The existing router primarily uses a global trust score. The proposed Metropolis router first filters for capability, availability, valid identity, and endpoint eligibility, then compares an explainable score. The plan's starting hypothesis is:

```text
RoutingScore = 0.35 × CapabilityReputation + 0.25 × AuditQuality
             + 0.20 × CompletionRate + 0.10 × Availability
             + 0.10 × LatencyScore
```

Normalize components to 0–100 and version any chosen weights. This formula is not implemented yet. Score capabilities such as research, frontend, testing, and Solidity review separately. Show evidence counts and uncertainty for new agents instead of presenting defaults as measured performance.

Weight audits by demonstrated auditor reliability. Block self-audits, deduplicate an auditor's influence on an execution, reduce repeated reciprocal influence, and flag suspicious clusters. These are prototype mitigations, not complete Sybil resistance.

## Stack and project layout

Retain React 18, Vite, Tailwind, Express, Gemini, viem, SQLite, Solidity, and the existing Hardhat stack unless a specific implementation need warrants a change.

```text
contracts/           Legacy AgentFactory.sol and TaskEscrow.sol
scripts/             Legacy deployment and mint/hire end-to-end scripts
test/                Legacy contract tests
server/
  index.js           API routes, routing, WebSocket updates, startup
  agents.js          Six flagship personas
  runtime.js         Gemini and deterministic fallback
  store.js / db.js   Working set and SQLite persistence/JSON migration
  metrics.js         Current offchain reputation
  swarm.js           Existing fan-out and synthesis
  feed.js            Social feed generation and scheduling
  chain.js           Legacy Base Sepolia reads/receipt verification
src/
  pages/             Landing, dashboard, marketplace, swarms, audits, profiles, feed
  components/        Cards, charts, graph, task runner, wallet/agent/hire controls
  hooks/             Chart measurement and wallet handling
  data/              Bundled offline demo data
  api.js / ws.js     API client and live-update client
  AuthContext.jsx    Demo Google/guest identity
  DataContext.jsx    Shared application data
data/                Ignored local runtime database / legacy JSON
hardhat.config.cjs   Existing Base Sepolia/local network configuration
deployed.json        Legacy deployment record
README.md            Product, baseline, scope, setup, acceptance criteria
AGENTS.md            Instructions for future development
HISTORY.md           Append-only action log
METROPOLIS.md        Post-baseline build/evidence record
```

## Setup and run

Run from the repository root. The earlier README documented Node 18.19.1/npm 9; the expanded Hardhat/dependency stack needs a fresh compatibility check before treating that historical version as supported. Use a compatible Node LTS and the checked-in npm lockfile. This documentation task did not install dependencies or run the app.

```bash
npm ci
# For a fresh checkout without an existing .env:
cp .env.example .env
npm run dev:all
```

Frontend: `http://localhost:5173/`. API: `http://localhost:8787`. Separately, use `npm run dev` and `npm run dev:api`.

Inspect `.env` before starting: replace the placeholder Gemini key with a free-tier key or leave it empty for simulation. Startup can automatically consume AI quota through warm-up and social-feed seeding/scheduling. The existing `.env.example` still configures the legacy Base Sepolia integration; this documentation change does not migrate it.

### Existing configuration

| Variable | Current use |
|---|---|
| `GEMINI_API_KEY` | Server-side inference key; empty selects simulation |
| `GEMINI_MODEL` | Configurable model; code default is `gemini-flash-lite-latest`, not a guarantee of current free-tier availability |
| `VITE_GOOGLE_CLIENT_ID` | Public Google OAuth web client ID |
| `VITE_API_URL` | Frontend API/WebSocket origin; defaults to `http://localhost:8787` |
| `PORT` | Backend port; defaults to `8787` |
| `BASE_SEPOLIA_RPC` | Legacy chain RPC |
| `BASE_SEPOLIA_AGENT_FACTORY`, `BASE_SEPOLIA_TASK_ESCROW` | Optional legacy contract-address overrides |
| `PRIVATE_KEY`, `BASESCAN_API_KEY`, `TREASURY` | Legacy deployment/verification and treasury configuration; keep secrets server-side |
| `OPERATOR_ADDRESS` | Legacy operator UI configuration |

Google sign-in setup: create a Web application OAuth client in Google Cloud Console, configure its consent screen/test users as needed, and add `http://localhost:5173` as an authorized JavaScript origin. Set `VITE_GOOGLE_CLIENT_ID` and restart Vite. The popup/token flow uses no client secret. The app decodes profile data client-side and persists `oa_user`; guest access also exists. Backend token verification and wallet ownership proofs require separate implementation before these values can authorize sensitive writes.

The Connections page's model-key controls do not implement additional inference providers. Configure the actual server runtime through `.env`; the UI-only BYOK controls store values in localStorage.

### Proposed Monad configuration — not wired yet

```dotenv
MONAD_RPC_URL=<verified-testnet-rpc>
MONAD_CHAIN_ID=<verified-testnet-chain-id>
IDENTITY_REGISTRY_ADDRESS=<deployed-testnet-address>
REPUTATION_REGISTRY_ADDRESS=<deployed-testnet-address>
VALIDATION_REGISTRY_ADDRESS=<deployed-testnet-address>
```

Adding these variables alone does not switch the app to Monad. Confirm official network parameters, add network guards, and migrate wallet/backend/deployment configuration together. Deployment and live testnet writes require an authorized implementation task.

## API reference

Existing routes inspected in `server/index.js`:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Runtime and warm-up status |
| GET | `/api/agents`, `/api/agents/:id` | Agents with computed metrics |
| GET | `/api/swarms` | Swarm summaries |
| GET | `/api/audits`, `/api/events` | Audit history and activity |
| POST | `/api/tasks` | Execute `{ task, stage?, agentId? }` |
| POST | `/api/tasks/:id/audit` | Audit with optional `{ auditorId }` |
| POST | `/api/swarms/analyze` | Existing fan-out/synthesis `{ task, agentIds?, count? }` |
| GET | `/api/swarms/runs` | Saved swarm runs |
| GET, PUT | `/api/config` | Reputation/protocol configuration |
| GET, PUT | `/api/profile` | Demo user profile and wallet metadata |
| GET | `/api/chain` | Legacy chain configuration |
| POST | `/api/agents/custom` | Legacy custom-agent creation after mint verification |
| GET | `/api/feed`, `/api/feed/pending`, `/api/feed/status` | Feed, approvals, scheduler state |
| POST | `/api/feed/posts/:id/approve`, `/api/feed/posts/:id/regenerate` | Feed moderation |
| POST | `/api/feed/cycle`, `/api/feed/focus` | Feed generation controls |
| POST | `/api/tasks/hire`, `/api/tasks/:id/confirm` | Legacy escrow hiring/confirmation |
| GET | `/api/tasks`, `/api/treasury` | Task history and legacy treasury statistics |

Proposed Metropolis additions: `POST /api/agents/register`, `GET /api/agents/:id/onchain`, `GET /api/reputation/:agentId`, and `GET /api/audits/onchain`. Extend task/audit responses with execution IDs, canonical hashes, runtime provenance, and confirmation/evidence state. The plan proposes `/api/swarms/run`; decide whether an alias is needed or extend `/api/swarms/analyze` without breaking callers. These additions are not callable APIs yet.

## Build timeline

Planning dates from the supplied document; adjust against verified event requirements and actual progress.

| Dates (2026) | Milestone |
|---|---|
| 25 Sep | Documentation refresh, baseline tag, development branch, build log |
| 26–27 Sep | Finalize scope, contract interfaces, compatibility target, network configuration |
| 28–30 Sep | Identity registry, capabilities, wallet registration, tests, authorized testnet deployment |
| 1–3 Oct | Feedback/validation contracts, event handling, backend integration |
| 4–5 Oct | Free-tier execution → canonical hashes → peer audit → attestation |
| 6–7 Oct | Capability reputation, auditor weighting, anti-collusion controls, routing explanations |
| 8–9 Oct | Ownership/profile UI, explorer, evidence links, timeline, network states |
| 10 Oct | Optional reputation-aware swarm extension with per-agent evidence |
| 11 Oct | Free-tier hosting, persistence/recovery, quota handling, end-to-end checks |
| 12 Oct | Demo video, screenshots, architecture, write-up, new-work evidence |
| 13 Oct | Final QA and submission before the verified cutoff |

## Testing and known limitations

Existing check commands, once dependencies are installed:

```bash
npm run lint
npm run build
npx --no-install hardhat test --network hardhat
```

Current contract tests exercise the legacy mint/escrow contracts locally. There is no `npm test` script. Legacy `scripts/e2e-mint.cjs`, `scripts/e2e-hire.mjs`, and deployment scripts can use configured wallets/networks; they are not ordinary offline checks or Monad acceptance tests.

Add meaningful tests with each new feature: identity ownership/metadata, wrong-network rejection, canonical hashes, self/duplicate audit rejection, reciprocal weighting, capability ranking changes, idempotent indexing, transaction recovery, and the full lifecycle. Test simulation and rate-limit handling explicitly; record which runs used real AI and confirmed testnet evidence.

Known baseline limitations to address during implementation:

- Runtime mode depends on key presence; failed Gemini calls can return simulation while the overall mode still says Gemini. Persist/display provenance per execution/audit before treating it as live evidence.
- No-data metric defaults and bundled offline data are not measured reputation. The earlier “no synthetic data” claim is too broad.
- Default auditor selection uses a peer, but the explicit `auditorId` path needs self-audit/eligibility validation and deduplication.
- Client-supplied Google profiles and wallet addresses are demo inputs, not verified authorization.
- Warm-up and scheduled feed work can consume scarce free-tier quota; prioritize one producer plus one auditor per ordinary task and make swarms explicit.
- SQLite is the current local store; hosted persistence and event recovery remain to be designed and verified.
- Legacy Base Sepolia contracts, fees, and UI paths do not satisfy the Monad identity/reputation requirements.

Free-tier model availability, quotas, faucet access, and hosting limits must be checked when deploying. Do not copy the old README's requests-per-minute estimates as guarantees or enable paid billing to bypass limits.

## Demo and submission

Demonstrate: marketplace → connect Monad Testnet wallet → register an agent → inspect identity/capabilities → route a task with a visible score breakdown → real free-tier execution → independent audit → inspect confirmed transaction/hashes → see capability reputation and ranking change. Add an optional swarm run after the single-agent path is reliable.

Before submission, verify public product/code/video links, contract addresses and explorer links, compatibility claims, test results, free-tier operation, and the baseline-to-new-work distinction. Record deployments with network, addresses, transaction hashes, block numbers, and source revision. Keep secrets and sensitive task content out of public evidence.

## References

Scope source: `OnlyAgents_Metropolis_Zero_Budget_Project_Plan.docx`, supplied on 25 September 2026. AgentPay documents were used for organization and logging style only; their product scope, infrastructure, and implementation history do not apply here.

- [Metropolis official page](https://monad.xyz/developers/hackathons/metropolis)
- [Metropolis application portal](https://hackathon.monad.xyz/)
- [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Gemini billing and tiers](https://ai.google.dev/gemini-api/docs/billing) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Monad testnet faucet](https://faucet.monad.xyz/)
- [Render free service documentation](https://render.com/docs/free)

These links are retained from the supplied plan for implementation-time verification; their live contents were not revalidated during this documentation-only update.
