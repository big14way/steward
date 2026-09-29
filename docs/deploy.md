# Deployment (Sep 29, 2026)

| Piece | Where | How |
|---|---|---|
| API (FastAPI) | Railway service `api`, project `steward` | `Dockerfile.api`, volume mounted at `/data` (`DB_PATH=/data/steward.db`), public domain `https://api-production-c6a14.up.railway.app` |
| Agent | Railway service `agent` | `Dockerfile.agent` (ships `contracts/abi` + `api/circle_client.py`), `SIGNER=circle`, `API_BASE` = the API's public domain |
| Dashboard (Next.js) | Vercel project `steward` → https://steward-arc.vercel.app (alias; `steward.vercel.app` was taken) | root directory `web`, `NEXT_PUBLIC_API=/api`, `API_INTERNAL=<railway api domain>` (the `/api/*` rewrite in `next.config.ts`), judge vars; Deployment Protection set to *preview only* via `PATCH /v9/projects/{id}` so `*.vercel.app` production URLs are public; GitHub repo linked, pushes to `main` deploy `web/` |
| Contracts | Arc Testnet | see README table |

Both Railway Dockerfiles use the repo root as build context. `railway up` uploads the working tree minus `.gitignore` (so no `.env` files
ever leave the machine); variables are set with `railway variable set` / `railway add --variables`. Railway rejects a Docker `VOLUME`
directive — attach a Railway volume instead (`railway service api && railway volume add --mount-path /data`).

## Moving the database between hosts

`GET /admin/db/export` and `POST /admin/db/import` (raw SQLite bytes, `X-Owner-Secret` header) copy the SQLite file. The import keeps a
`.bak`, swaps atomically, and re-runs migrations. Used once to move the local history (contractors, links, decisions) to Railway.

## Env that differs per host

- `PUBLIC_WEB` (API): the dashboard's public URL, used to build contractor invite links.
- `API_BASE` (agent): the API's public URL (or Railway private domain).
- `ARC_RPC` (API + agent): the Canteen-issued RPC URL (`~/.arc-canteen/env`, set Sep 29 on Railway and locally); the public `https://rpc.testnet.arc.io` is the fallback.
  The browser (`NEXT_PUBLIC_ARC_RPC`) keeps the public RPC so the per-builder key is never shipped in the client bundle.

## Gotchas

- Vercel enables Deployment Protection by default on some projects; the dashboard (and its `/api` proxy) then answers with a login
  wall. Disable it under Project → Settings → Deployment Protection, or the judges and contractors cannot open the site.
- Railway's CLI auto-updates itself mid-session; if a command says the binary is missing, reinstall with `npm i -g @railway/cli`.
- The Railway trial is $5 for 30 days with no card; these two services use a few cents a day.
