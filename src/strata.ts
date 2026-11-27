// Remote Strata telemetry v1 and explicitly selected legacy /metrics. No local sampling or inference.
export type Metric = number | null
export type Memory = { used: Metric; total: Metric; percent: Metric }
export type Device = { index: number; name: string; util: Metric; vram: Memory; temp: Metric; power: Metric }
export type Snapshot = { source: 'v1' | 'metrics'; cpu: Metric; prompt: Metric; reused: Metric; phase: string; model: string; loaded: boolean | null; context: Metric; ram: Memory; devices: Device[]; decode: Metric; prefill: Metric; active: Metric; queued: Metric }
export type Result = { status: string; snapshot: Snapshot | null }
export type RemoteOptions = { endpoint: string; keyEnv: string; refreshMs: number }
const MAX_BYTES = 2 * 1024 * 1024
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const num = (v: unknown): Metric => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const pct = (v: unknown): Metric => { const n = num(v); return n !== null && n <= 100 ? n : null }
const label = (v: unknown, max = 100): string => typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, max) : ''
const mem = (u: unknown, t: unknown): Memory => { const used = num(u), total = num(t); return { used, total, percent: used !== null && total !== null && total > 0 && used <= total ? 100 * (used / total) : null } }
export function parseSnapshot(raw: unknown): Snapshot {
  const data = object(raw)
  if (data.schema_version !== 1) throw new Error('Unsupported schema')
  if (object(data.quality).telemetry === 'unavailable' || data.source === 'status-only') throw new Error('Telemetry unavailable')
  const model = object(data.model), ram = object(data.ram), rates = object(data.rates), work = object(data.work)
  const rows = Array.isArray(data.devices) ? data.devices.slice(0, 16).map(object) : []
  const devices: Device[] = []
  for (const row of rows) {
    const index = num(row.index)
    if (index === null || !Number.isSafeInteger(index) || rows.filter(r => r.index === index).length !== 1) continue
    devices.push({ index, name: label(row.name), util: pct(row.util), vram: mem(row.mem_used, row.mem_total), temp: num(row.temp), power: num(row.power) })
  }
  const selected = object(data.topology).selected_devices
  const ordered = Array.isArray(selected) && selected.length > 0
    ? [...new Set(selected.slice(0, 16).filter((i): i is number => typeof i === 'number' && Number.isSafeInteger(i) && i >= 0))].map(index => devices.find(d => d.index === index) ?? { index, name: '', util: null, vram: mem(null, null), temp: null, power: null })
    : devices
  return { source: 'v1', cpu: null, prompt: null, reused: null, phase: '', model: label(model.id), loaded: typeof model.loaded === 'boolean' ? model.loaded : null, context: num(model.context), ram: mem(ram.used, ram.total), devices: ordered, decode: num(rates.answer_tok_s), prefill: num(rates.prefill_tok_s), active: num(work.active), queued: num(work.queued) }
}
/** The unversioned dashboard payload is distinct from the v1 telemetry contract. */
export function parseMetrics(raw: unknown): Snapshot {
  const data = object(raw)
  if ('schema_version' in data || !('hardware' in data) || !('engine' in data) || !('live' in data)) throw new Error('Unsupported metrics payload')
  const h = object(data.hardware), hs = object(data.hardware_static), engine = object(data.engine), live = object(data.live)
  // Aggregate GPU readings cannot be assigned to individual cards on a multi-GPU host.
  const devices: Device[] = hs.gpu_count === 1 ? [{ index: 0, name: label(hs.gpu_name), util: pct(h.gpu_util),
    vram: mem(h.gpu_mem_used, h.gpu_mem_total), temp: num(h.gpu_temp), power: num(h.gpu_power) }] : []
  const generating = live.state === 'generating'
  const prompt = generating ? num(live.prompt_tokens) : null
  const reused = generating ? num(live.reused) : null
  return { source: 'metrics', cpu: pct(h.cpu), prompt, reused: prompt !== null && reused !== null && reused <= prompt ? reused : null,
    phase: label(live.phase, 24), model: label(engine.model), loaded: generating ? true : null,
    context: num(engine.max_context) ?? num(engine.context), ram: mem(h.ram_used, h.ram_total), devices,
    decode: generating ? num(live.tok_s) : null, prefill: generating ? num(live.prefill_tok_s_mean) : null,
    active: null, queued: num(live.queued) }
}
export function remoteOptions(raw: unknown, env: Record<string, string | undefined> = process.env): RemoteOptions | null {
  const opts = object(raw)
  if (opts.source !== 'strata') return null
  const endpoint = typeof opts.endpoint === 'string' ? opts.endpoint : env.STRATA_TELEMETRY_URL ?? 'http://127.0.0.1:18080/v1/telemetry'
  const url = new URL(endpoint)
  const metrics = url.pathname.endsWith('/metrics')
  const keyEnv = typeof opts.keyEnv === 'string' ? opts.keyEnv : metrics ? 'STRATA_API_KEY' : 'STRATA_MONITOR_KEY'
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(keyEnv)) throw new Error('Invalid key environment variable name')
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash || !(url.pathname.endsWith('/v1/telemetry') || metrics)) throw new Error('Use HTTPS or a loopback SSH tunnel ending in /v1/telemetry or /metrics')
  const refreshMs = num(opts.refreshMs)
  return { endpoint: url.href, keyEnv, refreshMs: refreshMs === null ? 2000 : Math.max(1000, Math.min(60000, Math.round(refreshMs))) }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    await response.body?.cancel()
    throw new Error('Expected JSON')
  }
  if (Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) { await response.body?.cancel(); throw new Error('Invalid response size') }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new Error('Response too large')
      chunks.push(value)
    }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export async function collectStrata(options: RemoteOptions, signal?: AbortSignal, request: typeof fetch = fetch, env: Record<string, string | undefined> = process.env): Promise<Result> {
  const metrics = new URL(options.endpoint).pathname.endsWith('/metrics')
  const key = env[options.keyEnv]?.trim()
  if (!key || /[\r\n]/.test(key)) return { status: metrics ? 'Missing API key' : 'Missing monitor key', snapshot: null }
  const timeout = AbortSignal.timeout(3000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  try {
    const response = await request(options.endpoint, { method: 'GET', headers: { Accept: 'application/json', Authorization: 'Bearer ' + key }, redirect: 'error', signal: combined })
    if (!response.ok) { await response.body?.cancel(); return { status: response.status === 401 || response.status === 403 ? 'Auth denied' : response.status === 404 ? (metrics ? 'Metrics unavailable' : 'API v1 unavailable') : 'HTTP ' + response.status, snapshot: null } }
    const data = await boundedJson(response)
    return { status: 'Online', snapshot: metrics ? parseMetrics(data) : parseSnapshot(data) }
  } catch { return { status: combined.aborted ? 'Timeout / stopped' : 'Offline / invalid data', snapshot: null } }
}
