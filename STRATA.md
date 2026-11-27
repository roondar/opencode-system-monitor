# Remote Strata monitor (OpenCode V2)

Opt-in remote mode; local mode is unchanged. Uses authenticated GET /v1/telemetry (schema v1) by default, or explicitly configured GET /metrics for the legacy dashboard payload. No inference or local metrics. Displays remote RAM, up to four selected GPUs, VRAM, temperature, power, answer/prefill rates, context capacity, active and queued requests. Missing readings are not zero; failed polls clear the panel. CPU and live prompt/cache reuse are available only in /metrics mode; disk/swap and expert-cache statistics are omitted.

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

Endpoint defaults to STRATA_TELEMETRY_URL or the loopback URL above. Restart OpenCode and open a session with a visible sidebar. Remote cleartext HTTP, URL credentials, query strings and redirects are rejected. The collector limits responses to 2 MiB and applies a 3-second timeout. Polls do not overlap. HTTP 404 is shown explicitly; no automatic legacy fallback or local metrics substitution.

### Legacy dashboard metrics (CPU and live prompt)

For older Strata servers or to display CPU, set `endpoint` to `http://127.0.0.1:18080/metrics` and `keyEnv` to `STRATA_API_KEY`. Export the inference API key in the launching shell; the restricted telemetry monitor key may not authorize this endpoint. This is a deliberate opt-in to broader access. The plugin discards request history and never displays request IDs. It shows the live prompt token count relative to context capacity, prompt reuse percentage, CPU, RAM, phase, current generation rate and mean prefill rate. Aggregate GPU metrics are shown only when `hardware_static.gpu_count` is exactly 1; for multi-GPU use v1. No active request count is invented.

## Validation

```sh
node --experimental-strip-types --test tests/strata-remote.test.mjs
bun test
bun run typecheck
bun run build
```

Tests use synthetic telemetry; live TUI and server integration still require validation. The model context is capacity; legacy live prompt length is not full KV occupancy. Legacy generation speed uses live.tok_s; prefill uses live.prefill_tok_s_mean. V1 rates retain their engine-reported meaning. Neither is aggregate output.

Upstream: https://github.com/Caio2a7/opencode-system-monitor (MIT).
Contract: https://github.com/Niko1221/Strata/blob/v0.2.21/docs/TERMINAL_TELEMETRY_FIELDS.md
