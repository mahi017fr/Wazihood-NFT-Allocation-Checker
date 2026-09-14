# Wazihood $WAZI Allocation Checker — Production Deployment (Vercel)

This guide deploys the checker with a **hosted PostgreSQL database (Neon)** so
allocation snapshots survive cold starts, redeploys, and all concurrent
serverless instances. The same wallet always receives the same finalized
allocation.

## Architecture recap

| Layer | Production (Vercel) | Local development |
| --- | --- | --- |
| Frontend | `dist/` from `npm run build` served by Vercel edge | Vite dev server |
| API | `api/index.ts` serverless function (Express) | `npm run server` |
| Persistence | `ALLOCATION_STORE=postgres` → Neon PostgreSQL | `ALLOCATION_STORE=sqlite` |

- `server/persistence/postgresAllocationRepository.ts` implements the same
  `AllocationRepository` interface as the SQLite store; the service layer never
  knows which store is active.
- Store selection: `ALLOCATION_STORE=postgres` uses `DATABASE_URL`;
  `ALLOCATION_STORE=sqlite` uses `ALLOCATION_DB_PATH`.
- Database-inflicted guarantees:
  - `UNIQUE(wallet_address, network)` — a wallet can only ever receive
    one allocation snapshot.
  - Insert-then-read-on-conflict — simultaneous requests for the same wallet
    both return the identical allocation.
  - `SELECT ... FOR UPDATE` on the network's pool-ledger row — the 300,000,000
    $WAZI pool is never oversubscribed, even across concurrent instances.

## Required Vercel environment variables

| Variable | Value |
| --- | --- |
| `ALLOCATION_STORE` | `postgres` |
| `DATABASE_URL` | your Neon connection string, e.g. `postgresql://user:password@ep-xxx.region.aws.neon.tech/wazihood?sslmode=require` |
| `WAZI_NFT_CONTRACT_ADDRESS` | the Wazihood NFT contract address (leave empty until known — the API returns a clear config error, never fake data) |
| `ALCHEMY_URL` **or** `ALCHEMY_API_KEY` | Robinhood Chain data provider (indexed transaction/nonce queries) |
| `TOTAL_WAZI_SUPPLY` | `1000000000` |
| `ALLOCATION_POOL` | `300000000` |
| `ALREADY_ALLOCATED` | `0` unless tokens were already committed outside this system |
| `MIN_ELIGIBLE_ALLOCATION` / `MAX_ELIGIBLE_ALLOCATION` / `MAX_ACTIVITY_ALLOCATION` | `1`, `100000`, `30000` |
| `ACTIVITY_SCORE_TIERS_JSON` | `{"1":10,"5":25,"10":40,"25":55,"50":70,"100":80,"250":92,"500":100}` |
| `NFT_HOLDER_BONUS_ALLOCATION` / `NFT_HOLDER_BONUS_PERCENT` | `0` / `20` |
| `ROBINHOOD_CHAIN_ID` | `4663` |
| `ROBINHOOD_RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` |

`DATABASE_URL`, the Alchemy key, and any RPC secrets are **server-side only**.
They are never exposed through `/api/*` or bundled into the frontend.

## 1. Create the Neon PostgreSQL database

1. Sign up / log in at https://neon.tech and create a new project (any region,
   e.g. `us-east-1`).
2. Create a database (default `neondb` is fine; rename to `wazihood` if you
   prefer).
3. From the dashboard copy the **connection string** for the `Pooled`
   connection (it is used by the serverless driver). It looks like:
   `postgresql://user:password@ep-xxx.region.aws.neon.tech/wazihood?sslmode=require`
4. This URL is the value of `DATABASE_URL`. Keep it secret — never commit it.

## 2. Set the connection string locally / in CI (optional)

For running the migration from your machine, export it once:

```bash
export DATABASE_URL="postgresql://user:password@ep-xxx.region.aws.neon.tech/wazihood?sslmode=require"
export ALLOCATION_STORE=postgres
```

## 3. Run the database migration

The migration is **idempotent** and never drops allocation data. It:

- creates `allocation_snapshots` and `allocation_pool_ledger` if they do not
  exist (one snapshot per wallet with a `UNIQUE(wallet_address, network)`
  constraint), and
- **automatically upgrades a legacy "Season 01" schema to the current
  season-free schema**: it drops the `season` column (which carries no data
  anymore), replaces the old `(wallet_address, season, network)` unique
  constraint with `UNIQUE(wallet_address, network)`, rebuilds the pool ledger
  with `PRIMARY KEY (network)` reconciled from the snapshot totals, and
  collapses any duplicate wallet/network rows to the most recent snapshot.
  **All existing finalized allocation snapshots are preserved unchanged.**

Run it:

```bash
npm install
npm run migrate
```

Expected output:

```
[migrate] PostgreSQL schema ready on "ep-xxx.region.aws.neon.tech" (store=postgres, table=allocation_snapshots, ledger=allocation_pool_ledger)
[migrate] legacy "Season 01" schema is upgraded automatically when detected
[migrate] done
```

> Local-only note: with `ALLOCATION_STORE=sqlite` (default), `npm run migrate`
> initializes the on-disk `data/allocations.sqlite` instead.

## 4. Set Vercel environment variables

In the Vercel project dashboard (`Settings → Environment Variables`), add
**every** variable from the table above for the `Production` environment.
Set `ALLOCATION_STORE=postgres` and `DATABASE_URL` to your Neon URL.

## 5. Deploy

```bash
vercel --prod
```

`vercel.json` is already configured:

- `buildCommand: npm run build` → builds the Vite frontend into `dist/`.
- `outputDirectory: dist` → `dist/` is served statically by Vercel.
- `rewrites: /api/(.*) → /api/index` → all API traffic goes to the Express
  serverless function in `api/index.ts`.

## 6. Verify `/api/health`

```bash
curl https://<your-vercel-url>/api/health
```

Expected:

```json
{ "success": true, "data": { "status": "ok", "network": "Robinhood Chain",
  "chainId": 4663, "nftContractConfigured": true, "dataProviderConfigured": true,
  "nftStandard": "ERC721" } }
```

## 7. Verify a wallet allocation

```bash
curl -X POST https://<your-vercel-url>/api/allocation/check \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x71C44F3a9B3f6b4E90B04aF5796E25bB24F88F29"}'
```

An eligible wallet returns `allocationSource: "new_calculation"` on its **first**
check.

## 8. Verify repeat submission returns the snapshot

Run the same `curl` again. The response must return the **exact same
allocation** with `allocationSource: "snapshot"` — no recalculation, no matter
how the wallet's activity or NFT ownership changed.

## 9. Verify pool / metrics

```bash
curl https://<your-vercel-url>/api/metrics
```

```json
{ "success": true, "data": { "network": "Robinhood Chain",
  "allocationPool": 300000000, "amountAllocated": 0, "remainingPool": 300000000,
  "totalWaziNftHolders": null, "totalWaziNftSupply": null, "totalIndexedTransactions": null } }
```

`totalWaziNftHolders` / `totalWaziNftSupply` / `totalIndexedTransactions` are
`null` wherever no real indexer is configured — they are never fabricated.

## Rollback / local development

Production persistence lives in Neon; nothing is stored on the Vercel
filesystem. To switch back to a local store, set
`ALLOCATION_STORE=sqlite` and run `npm run server`.
