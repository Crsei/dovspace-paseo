# PM integration

Paseo links to a separately deployed Project Management service. PM owns accounts,
sessions, workspaces, projects, Markdown, attachments, commands, and SSE; Paseo owns the
entry point, workspace mapping, and status surface. Neither service reads the other's
storage.

The delivery path is same-origin edge routing (`paseo.localhost` → Paseo,
`pm.localhost` → PM). PM pages run in PM's own origin; Paseo never reimplements them.

## Baseline

| Fact           | Value                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| PM repository  | `https://github.com/Crsei/project-management-agent-v4`                                                    |
| Local checkout | `../project-management-agent-v4` (sibling; keep its pnpm workspace and lockfile)                          |
| PM commit      | `4c48a57d8ba9936b6b2fd57aa0fef63041be5489`                                                                |
| PM version     | `0.1.1-preview.2`                                                                                         |
| OpenAPI        | `docs/contracts/openapi.yaml`, SHA-256 `11249ede732705785731e00888b7e24d3069bea18a62cb4598c59f4022221089` |
| Operations     | 187 across 174 paths                                                                                      |
| Paseo commit   | recorded by `docs/pm-integration-clone.json` at each refresh                                              |

`docs/pm-integration-baseline.json` is generated from the PM checkout.
`docs/pm-integration-clone.json` records the clone, branch position, dirty-file count, and
when it was captured. Re-run `node scripts/pm/clone.mjs` after changing the PM checkout.

Do not add PM to Paseo's npm workspace. PM remains a pnpm workspace; the two repositories
are built and installed independently.

## Ports

| Service                             | Port    | Notes                                                        |
| ----------------------------------- | ------- | ------------------------------------------------------------ |
| PM gateway (public app + API proxy) | `3225`  | The adapter's default base URL                               |
| PM API                              | `4195`  | Fastify; gateway proxies `/api`, `/health`, `/openapi.json`  |
| PM Agent API                        | `4325`  | Reached through the gateway's `/agent/api` and `/mcp` routes |
| PM worker                           | no HTTP | Required for readiness                                       |
| Unified edge                        | `7000`  | `deploy/pm-integration/Caddyfile`                            |

## Dedicated local stack

The Paseo integration runs its own PM entry on `3225`, separate from the legacy
`3224` gateway:

```bash
npm run pm:local:start   # API :4195, gateway :3225, logs in .dev/pm-integration
npm run pm:local:status
npm run pm:local:stop
```

The API keeps PM's data root and database; only its listening port and
`PUBLIC_ORIGIN` change. `3224`/`4194` are stopped and left free for other
consumers; the Paseo plugin and all verification scripts use `3225`.

## Adapter

`packages/pm-integration` is Paseo's only PM API client. It has no runtime dependency
beyond `fetch`.

- `src/generated/operations.gen.ts` is generated from PM's OpenAPI by
  `scripts/pm/sync-contract.mjs`. Every contract operation is addressable by its
  `operationId`; the manifest carries method, path, auth class, path params, and body/media
  types.
- `src/http.ts` is a dependency-free transport used by the adapter and vendored into the
  built-in plugin. It handles bearer/cookie auth, timeouts, error envelopes, downloads,
  and SSE reconnect with `Last-Event-ID`.
- `src/client.ts` exposes `PmClient.request(operationId)`, `probe()`, `download()`,
  `subscribe()`, `executeCommand()`, and `getCommandReceipt()`.
- `src/pages.ts` is the PM page registry used for deep links: 34 production routes with
  auth level, parameters, and PM dependencies. Lab routes are excluded.

Writes never retry. `PmClient.executeCommand()` throws
`PmCommandOutcomeUnknownError` when a write may have committed; callers must query the
original `commandId` with `getCommandReceipt()`. A `409` is a real conflict, not an
unknown outcome.

### Refresh the contract

```bash
node scripts/pm/clone.mjs                 # fetch PM + regenerate operation manifest and plugin vendor files
node scripts/pm/sync-contract.mjs --check # CI gate: fails on PM OpenAPI drift
node scripts/pm/sync-plugin-vendor.mjs --check
npm run typecheck --workspace=@getpaseo/pm-integration
npx vitest run --config vitest.config.ts # from packages/pm-integration
```

### Live route probe

```bash
npm run pm:probe -- --base-url http://127.0.0.1:3225 --json artifacts/pm-contract-probe.json
```

The probe calls every manifest operation. Reads use the configured session; writes are
sent without credentials and with `{}` so PM rejects them before mutating. A 404 counts as
reachable only with PM's `{error:{code},requestId}` envelope; Fastify's route-missing 404
fails the probe. Pass `--token`, `--cookie`, or set `PM_INTEGRATION_TOKEN` /
`PM_INTEGRATION_COOKIE` to authenticate reads.

## Paseo plugin

`plugins/dovspace-pm` is a built-in plugin:

- daemon RPCs: `pm.status`, `pm.session`, `pm.workspaces`, `pm.projects`, `pm.pages`,
  `pm.target`
- a full screen with health, session, workspace/project selection, and every PM page
  grouped by scope
- a sidebar footer entry, workspace-row `PM` badge for mapped workspaces, Command Center
  entry, and settings screen
- settings (host-scoped): PM base URL, open mode, and Paseo workspace ↔ PM workspace/project
  mappings

Credentials stay in the daemon environment:

```bash
PM_INTEGRATION_BASE_URL=http://127.0.0.1:3225   # optional override of the setting
PM_INTEGRATION_TOKEN=...                        # opaque PM session token (bearer)
PM_INTEGRATION_COOKIE=pm_v4_session=...         # alternative; token wins
```

The session must belong to a dedicated PM account. Never use another person's session
cookie, and never expose the token to the Paseo app client.

Built-in plugins load on daemon start. Editing the plugin requires a daemon restart (or a
Paseo dev restart); directory-plugin reload does not apply to built-ins.

## Edge

`deploy/pm-integration/Caddyfile` serves both hosts on `:7000`:

- `paseo.localhost` → `6768` (WebSocket and API untouched)
- `pm.localhost` → `3225`, with `/api/v1/internal/*` blocked, SSE unbuffered, and
  Cookie/Origin/Last-Event-ID preserved
- `/agent/api/*`, `/mcp`, `/oauth/*`, `/.well-known/*` stay on the PM gateway

PM's `PUBLIC_ORIGIN` must equal the PM external origin (for example
`http://pm.localhost:7000`). PM does not enable CORS; Paseo-side reads go through the
plugin daemon, never the browser.

## Verification

```bash
npm run pm:contract:check
npm run pm:probe
npm run pm:pages:verify     # Playwright route matrix; requires PM test credentials
npm run pm:plugin:check     # compile the built-in plugin with the daemon compiler
npm run pm:plugin:rpc       # call pm.status/pm.session/pm.workspaces on a running daemon (PASEO_RPC_URL)
```

The page matrix treats a page as passing only when the routed app renders without the
login redirect, the not-found page, or the bootstrap error boundary. PM readiness is
separate: `/health/ready` must be 200 for writes and page data to be trusted.

## Current verification

Recorded on 2026-11-26 against the local PM gateway (`:3225`) and the rebuilt PM API:

| Check                           | Result                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract manifest               | 187 operations, 174 paths, OpenAPI SHA-256 matches the baseline                                                                                                                                       |
| Live route probe (anonymous)    | 187/187 reachable; writes rejected before mutation                                                                                                                                                    |
| Live route probe (test session) | 187/187 reachable (45 × 200, 67 × 400, 40 × 401, 2 × 403, 30 × 404, 3 × 503)                                                                                                                          |
| Page matrix (3225/4195)         | 34/34 production pages passed with an isolated PM test account and Chrome                                                                                                                             |
| Direct sidebar entry            | Opens `http://127.0.0.1:3225/pm`; unauthenticated load shows PM's login page, not the bootstrap error surface                                                                                         |
| Plugin                          | typecheck + lint clean; real compiler produced client/server bundles; an isolated daemon loaded all six RPCs and returned live status, the test actor, one workspace, and an explicit unmapped target |
| PM ready                        | **503** — see the data condition below; reads and all 34 page routes still pass                                                                                                                       |

The page matrix used a dedicated account created with PM's `scripts/create-account.ts`,
a sample workspace, and the session in `artifacts/pm-test-session.json` (ignored, 0600).

## Known gaps

- `GET /health/ready` is 503 because workspace `859e19a1-1aa3-47a8-8d4d-12949eab5d8c`
  registers project `PRJ-001` at `.local/analysis/task-detail-verify`, and that directory no
  longer exists. PM's core mount enumeration and project blob check fail the whole readiness
  probe on the stale mount. Repair or remove that project mount from the owning workspace;
  do not recreate a fake project directory.
- PM page titles and content are Chinese/English by PM's own locale; Paseo only links.
- The PM Agent API and `/mcp` are routed by the PM gateway. Paseo does not proxy them.
