# Free hosting: Vercel and Supabase

The frontend and API deploy together to Vercel. Supabase Postgres is the durable
database and Supabase Cron invokes bounded maintenance jobs. Render is not used.
Wallet identity remains wallet-only; Supabase Auth/email login is not enabled.

## 1. Create the database

Create a Supabase Free project. Run [schema.sql](../supabase/schema.sql) in its
SQL editor. Obtain the project HTTPS URL and server `service_role` key from
the project settings. Keep the key private; never put it in a VITE variable.
The public/anonymous roles cannot read application records or call persistence
functions. No browser Supabase credentials are needed.

## 2. Optional existing-history import

Stop the local API and create a consistent backup with `npm run backup`.
Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in your local ignored
`.env`. Keep `PERSISTENCE_BACKEND` blank for local SQLite operation.

```sh
npm run import:supabase -- data/store.db
npm run import:supabase -- data/store.db --apply
npm run check:supabase
```

The first command previews counts and makes no network changes. The second
copies rows only into an empty hosted database and leaves the local file intact.
It excludes local session tokens, login challenges and request-id cache entries;
sign in again with your wallet on the hosted site. Do not submit hosted tasks
before importing: import refuses to overwrite existing records. Existing
contracts and recorded transaction hashes are preserved.

## 3. Deploy from Git on Vercel

Commit and push all changes, including `api`, `server`, `shared`, `supabase`,
`deployed.json`, and `vercel.json`. In Vercel import the repository with:

- Root directory: `.`
- Framework: Vite
- Node.js: 22.x or 24.x
- Build command: keep `node scripts/vercel-build.mjs` from the configuration
- Output directory: `dist`
- Enable Fluid Compute; API duration is configured at 300 seconds.

Set these **server-only Production environment variables** before deploying:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | Your `https://PROJECT.supabase.co` URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your private server service-role key |
| `APP_ORIGIN` | Exact production `https://YOUR-PROJECT.vercel.app` origin |
| `CRON_SECRET` | A random secret of at least 32 characters |
| `GEMINI_API_KEY` | Your existing Gemini key |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` or your selected model |
| `ESCROW_OPERATOR_PRIVATE_KEY` | Existing dedicated delivery operator's key |
| `BASE_SEPOLIA_RPC` | Base Sepolia RPC URL; default is `https://sepolia.base.org` |
| `FEED_CYCLE_ENABLED` | `false` initially; set `true` for scheduled generation |

Generate CRON_SECRET locally, for example with `openssl rand -hex 32`; do not
post it in chat or commit it. No platform-owner/deployer private key is needed.
Never upload `.env.deploy`. `VERCEL=1` selects Supabase automatically; local
development retains SQLite. The build forces same-origin API requests and
15-second visible-page polling. No external API rewrite or WebSocket is used.
Use the production URL: preview origins are intentionally denied by production
wallet-login origin checks. Production secrets should not be copied into
untrusted preview deployments.

## 4. Enable durable scheduling

Enable `pg_cron` and `pg_net` in Supabase's Database Extensions dashboard.
In Supabase Vault, add:

- `onlyagent_origin`: the exact production Vercel origin
- `onlyagent_cron_secret`: the same secret as Vercel's `CRON_SECRET`

Then run [schedule.sql](../supabase/schedule.sql). It creates one named schedule
every minute; re-running replaces that schedule. This uses Supabase Cron, not
Vercel Hobby's once-per-day cron. Review invocation responses in Supabase's
Cron/pg_net monitoring; a 503 busy response retries on the next invocation.
Use `select cron.unschedule('onlyagent-tick');` to stop the schedule.

Each invocation performs one escrow synchronization or one agent's feed work.
Checks rotate fairly through unresolved tasks; a large backlog therefore delays
release. The job state survives function restarts. Customer retry and explicit
task synchronization remain available. Feed generation remains opt-in and
consumes Gemini quota. Payment resolution still requires the administrator's
MetaMask signature, not a server administrator key.

## 5. Verify after deployment

1. Open `/api/health`; it should return JSON, not the SPA or a storage error.
2. Sign in with a wallet, reload `/app/marketplace`, and check the session.
3. Create an ordinary task and verify history survives redeployment.
4. Check escrow readiness before paying. Recover an existing receipt using the
   original transaction hash if verification is interrupted; never pay again.
5. Confirm scheduled calls succeed and a second wallet cannot access private
   task data. Keep a periodic external export/backup of the hosted database.

## Persistence and free-plan limits

Postgres stores application rows as a versioned JSONB snapshot, including wallet
profiles, hashed sessions, task history, escrow operation hashes and job state.
Each API invocation builds a request-local SQLite **in-memory working copy** for
the existing validated queries. It is disposable; no local file is authoritative
or required on Vercel. Read requests have independent snapshots. A Postgres
lease serializes writes, and revision/token checks reject stale workers.
Checkpoints are persisted before AI calls, after operator transaction submission,
and before responding to wallet/session/payment writes.

This design suits a small free-tier deployment. Only one write workflow runs at
a time; overlapping actions receive a retryable 503, while reads remain
available. It loads and checkpoints the full snapshot, so large history or high
traffic can exceed free quotas. A future per-record Postgres repository and
dedicated queue are needed to scale it. Free plans have finite compute,
invocation, database and egress quotas; they do not promise unlimited operation.

Supabase Free provides 500 MB of database storage and may pause low-activity
projects after seven days. A paused project stops the app and schedule until
restored. Vercel Hobby is intended for personal, non-commercial use; check its
terms before operating this paid marketplace commercially. Gemini and RPC
provider limits apply separately. Contracts remain on Base Sepolia testnet.

Long requests are bounded by Vercel's 300-second duration. Progress and receipt
hashes are durable; interrupted running work is recoverable through the existing
task/revision retry flow. There is no fire-and-forget AI work after HTTP responses.

References: [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase),
[Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing),
[Supabase Cron](https://supabase.com/docs/guides/cron),
[Vercel function limits](https://vercel.com/docs/functions/limitations),
[Vercel Hobby](https://vercel.com/docs/plans/hobby).
