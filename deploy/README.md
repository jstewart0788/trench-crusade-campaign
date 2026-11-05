# Deploying to ryn-main

**Status 2026-11-04:** steps 2–4 run; `tc-web` healthy on the internal `tc` network with only
`kamal-proxy` beside it; route `tc.rynfin.org → tc-web:3001` registered with TLS; from inside the
container both `ryn-financial-db` and the internet are unreachable (verified). Waiting on the DNS
record (step 1) for the certificate to issue.

Host: `ryn-main` (Hetzner, 178.104.139.55), the box that runs ryn-financial under Kamal 2.
Hostname: `tc.rynfin.org` — **needs an A record to 178.104.139.55 before `setup-host.sh`**
(no record exists today and `rynfin.org` has no wildcard).

## Isolation design

| Concern | Setting | Where |
|---|---|---|
| Network | own `tc` network, created `--internal` (no internet, no route to the `kamal` network where the financial app and its TimescaleDB live) | `setup-host.sh`, compose `networks` |
| Way in | only `kamal-proxy`, attached to `tc`, routing `tc.rynfin.org` → `tc-web:3001` with Let's Encrypt TLS; the host still exposes only 80/443 | `setup-host.sh` |
| Process | non-root uid 10001, read-only root fs, `/tmp` tmpfs 32m, all capabilities dropped, `no-new-privileges` | `Dockerfile`, compose |
| Resources | 512 MB memory, 256 pids | compose |
| Data | one named volume `tc-data` holding the SQLite file; nothing from the host mounted | compose |
| Abuse | 120 requests/min per IP on `/api`, 1 MB body cap, no auth (private group) | `apps/api/src/app.ts` |
| Image | built on the host from this repo (`docker compose build`), no registry | `deploy.sh` |

What a full compromise of the app buys an attacker: a non-root process on an internal network
whose only neighbour is kamal-proxy. Reaching the financial stack from there needs a Docker or
kernel escape, not a configuration gap.

## Steps (in order)

1. DNS: `tc.rynfin.org` A → `178.104.139.55`.
2. On the host, once: `git clone https://github.com/jstewart0788/trench-crusade-campaign.git ~/trench-crusade`
3. `cd ~/trench-crusade && deploy/deploy.sh` (builds the image, starts `tc-web` on the `tc` network).
4. `deploy/setup-host.sh` (attaches kamal-proxy to `tc`, registers the route with TLS).
5. Check: `curl -s https://tc.rynfin.org/api/health`.
6. Point the TTS importer's API field at `https://tc.rynfin.org` (the mod's default stays localhost).

Updates: `cd ~/trench-crusade && deploy/deploy.sh`. Rollback: `git checkout <sha> && deploy/deploy.sh`.
Remove: `docker compose -f deploy/docker-compose.yml down`, `docker exec kamal-proxy kamal-proxy remove trench-crusade`.

## To verify on the host before running

- Verified on the host: kamal-proxy v0.9.2, container `kamal-proxy`, CLI accepts the flags used. Whether registered routes persist across a
  proxy restart (Kamal re-registers its own on `kamal deploy`; ours may need `setup-host.sh` after a
  proxy restart — check `kamal-proxy list` then).
- `pnpm deploy` output layout in the Dockerfile builds on this pnpm version.
