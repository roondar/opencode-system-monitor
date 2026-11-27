# Remote Strata monitor (OpenCode V2)

Opt-in remote mode; local mode is unchanged. Uses authenticated GET /v1/telemetry (schema v1) only, no inference or local metrics. Displays remote RAM, up to four selected GPUs, VRAM, temperature, power, answer/prefill rates, context capacity, active and queued requests. Missing readings are not zero; failed polls clear the panel. CPU, disk, swap, active context and expert-cache statistics are omitted because they are not guaranteed by the telemetry contract.

## Install

Clone this fork, check out the desired revision and run:

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
```

Use HTTPS with a valid certificate or an SSH tunnel, for example:

```sh
ssh -N -L 127.0.0.1:18080:127.0.0.1:8080 USER@STRATA_HOST
```

In the terminal launching OpenCode, set a dedicated read-only monitor credential without committing it:

```sh
read -rsp 'Strata monitor key: ' STRATA_MONITOR_KEY; echo
export STRATA_MONITOR_KEY
```

Add an entry to ~/.config/opencode/cli.json, retaining your other plugins:

```json
{"plugins":[{"package":"/absolute/path/to/opencode-system-monitor","options":{"source":"strata","endpoint":"http://127.0.0.1:18080/v1/telemetry","keyEnv":"STRATA_MONITOR_KEY","refreshMs":2000}}]}
```

Endpoint defaults to STRATA_TELEMETRY_URL or the loopback URL above. Restart OpenCode and open a session with a visible sidebar. Remote cleartext HTTP, URL credentials, query strings and redirects are rejected. The collector limits responses to 2 MiB and applies a 3-second timeout. Polls do not overlap. HTTP 404 is shown explicitly; no legacy fallback or local metrics substitution.

## Validation

```sh
node --experimental-strip-types --test tests/strata-remote.test.mjs
bun test
bun run typecheck
bun run build
```

Tests use synthetic telemetry; live TUI and server integration still require validation. The displayed model context is capacity, not live context occupancy; answer/prefill rates are engine-reported windows, not aggregate output.

Upstream: https://github.com/Caio2a7/opencode-system-monitor (MIT).
Contract: https://github.com/Niko1221/Strata/blob/v0.2.21/docs/TERMINAL_TELEMETRY_FIELDS.md
