# Paseo + PM local edge

Caddy v2 reverse proxy for a same-machine development setup. It listens on
`:7000` and routes by `Host`:

| Host                         | Upstream                        |
| ---------------------------- | ------------------------------- |
| `paseo.localhost` (any port) | `127.0.0.1:6768` (Paseo daemon) |
| `pm.localhost` (any port)    | `127.0.0.1:3225` (PM gateway)   |

`/agent/api/*`, `/mcp`, `/oauth/*` and `/.well-known/*` are PM-host paths and go
to the PM gateway; the edge never proxies them straight to the PM agent port.

## Start

Add the hosts entries (Linux/macOS `/etc/hosts`, Windows
`C:\Windows\System32\drivers\etc\hosts`):

```
127.0.0.1 paseo.localhost pm.localhost
```

Then run, from the repository root:

```sh
caddy run --config deploy/pm-integration/Caddyfile --adapter caddyfile
```

`.env.example` documents optional overrides. The Caddyfile defaults work
without a `.env`; if you create one, export it yourself
(`set -a; . deploy/pm-integration/.env; set +a`) because Caddy does not load it.

`compose.yaml` runs only the edge (Linux host networking, so container
localhost reaches host upstreams): `docker compose -f deploy/pm-integration/compose.yaml up -d`.

## Checks

```sh
# Edge health: answered by Caddy, no upstream involved.
curl -i http://127.0.0.1:7000/healthz

# PM host, exact and prefix internal paths: both must be 404.
curl -i -H 'Host: pm.localhost:7000' http://127.0.0.1:7000/api/v1/internal
curl -i -H 'Host: pm.localhost:7000' http://127.0.0.1:7000/api/v1/internal/secret

# Encoded/normalized variants: also 404.
curl -i --path-as-is -H 'Host: pm.localhost:7000' 'http://127.0.0.1:7000/api/v1/%69nternal/secret'
curl -i --path-as-is -H 'Host: pm.localhost:7000' 'http://127.0.0.1:7000/api/v1/internal%2fsecret'

# Browser entry points.
curl -i http://paseo.localhost:7000/
curl -i http://pm.localhost:7000/
```

## Cookies and origins

- Use PM at `http://pm.localhost:7000`, never through the Paseo host. PM
  cookies must be sent to the PM host only; the Paseo host neither receives nor
  forwards them. Navigate between the two hosts with full page loads, not a
  cross-origin iframe or shared cookie domain.
- Set PM's own `PUBLIC_ORIGIN` to exactly `PM_PUBLIC_ORIGIN` from
  `.env.example` (the browser-visible PM origin).
- Keep CORS disabled in PM and add no wildcard CORS at the edge.
- `Host`, `Origin`, `Cookie`, `Last-Event-ID` and `Authorization` pass through
  unchanged; the edge never rewrites `Origin`.

## Streaming

PM responses use `flush_interval -1`, so SSE is not buffered. Paseo WebSocket
upgrades are handled automatically; Caddy's HTTP transport defaults to no
read/write timeout (only a 3s dial timeout), so long-lived tunnels stay open.

## TLS (optional)

Plain HTTP is the default for `*.localhost`. To enable TLS, set `EDGE_HOSTS`
to the public names used in DNS, set `PM_HOST`/`PASEO_HOST` to those same
names, change the site address in the Caddyfile, and uncomment the `tls` line.
`EDGE_TLS=internal` uses Caddy's local CA; otherwise set an ACME e-mail address.
