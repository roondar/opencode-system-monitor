import { For, Show } from "solid-js"
import { palette } from "./palette"
import { usageColor } from "./scale"
import type { Metric, Memory, Result } from "./strata"
import type { MetricKind } from "./types"
const fmt = (n: Metric, digits = 0) => n === null ? '—' : n.toFixed(digits)
const gib = (m: Memory) => fmt(m.used === null ? null : m.used / 2**30, 1) + '/' + fmt(m.total === null ? null : m.total / 2**30, 1) + ' GiB'
const tokenCount = (n: Metric) => n === null ? '—' : n >= 1024 ? (n / 1024).toFixed(0) + 'K' : String(n)
export function StrataView(props: { theme: unknown; result: () => Result }) {
  const c = () => palette(props.theme)
  const Bar = (p: { label: string; percent: Metric; kind: MetricKind }) => {
    const fill = () => p.percent === null ? 0 : Math.round(12 * p.percent / 100)
    return <box flexDirection="row" gap={1}>
      <text fg={c().muted}>{p.label.padEnd(5)}</text>
      <text fg={p.percent === null ? c().muted : usageColor(c(), p.kind, p.percent)}>{'━'.repeat(fill())}</text>
      <text fg={c().border}>{'─'.repeat(12 - fill())}</text>
      <text fg={c().base}>{p.percent === null ? '—' : Math.round(p.percent) + '%'}</text>
    </box>
  }
  return <box border borderStyle="rounded" borderColor={c().border} paddingX={1} gap={0}>
    <text fg={c().base}><b>Strata · remote</b></text>
    <text fg={props.result().snapshot ? c().success : c().warning}>{props.result().status}</text>
    <Show when={props.result().snapshot}>{(s) => <>
      <text fg={c().muted}>{(s().model || 'Model —').slice(0, 27)}</text>
      <text fg={c().muted}>Model {s().loaded === null ? '—' : s().loaded ? 'loaded' : 'not loaded'} · {tokenCount(s().context)} max</text>
      <Bar label="RAM" percent={s().ram.percent} kind="ram" />
      <text fg={c().muted}>{gib(s().ram)}</text>
      <For each={s().devices.slice(0, 4)}>{(d) => <>
        <text fg={c().base}>{('GPU ' + d.index + ' ' + d.name).slice(0, 27)}</text>
        <Bar label="GPU" percent={d.util} kind="gpu" />
        <Bar label="VRAM" percent={d.vram.percent} kind="vram" />
        <text fg={c().muted}>{gib(d.vram)}</text>
        <text fg={c().muted}>{fmt(d.temp)}°C · {fmt(d.power)} W</text>
      </>}</For>
      <Show when={s().devices.length === 0}><text fg={c().muted}>GPU telemetry unavailable</text></Show>
      <Show when={s().devices.length > 4}><text fg={c().muted}>+{s().devices.length - 4} devices</text></Show>
      <text fg={c().base}>Decode  {fmt(s().decode, 1)} t/s</text>
      <text fg={c().base}>Prefill {fmt(s().prefill, 1)} t/s</text>
      <text fg={c().muted}>Active {fmt(s().active)} · Queue {fmt(s().queued)}</text>
    </>}</Show>
  </box>
}
