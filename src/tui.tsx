import { createSignal } from "solid-js"
import type { Plugin } from "@opencode/plugin/tui"
import { createCollector } from "./stats/collect"
import { parseOptions } from "./options"
import type { SystemStats } from "./types"
import { MonitorView } from "./view"
import { collectStrata, remoteOptions } from "./strata"
import type { Result, RemoteOptions } from "./strata"
import { StrataView } from "./strata-view"

const ID = "opencode-system-monitor"
const EMPTY: SystemStats = { cpu: null, ram: null, disk: null, gpu: null, swap: null }

// Plain object instead of `Plugin.define()` (an identity function): published installs then need no runtime import
// of `@opencode/plugin`, which the host does not provide to packages under node_modules.
const plugin = {
  id: ID,
  setup(context) {
    // Explicit remote mode; never fall back to local metrics.
    let remote: RemoteOptions | null
    try { remote = remoteOptions(context.options) } catch {
      return context.ui.slot({ append: "sidebar.content", render: () => <StrataView theme={context.theme} result={() => ({ status: "Invalid remote config", snapshot: null })} /> })
    }
    if (remote) {
      const config = remote
      const [result, setResult] = createSignal<Result>({ status: "Connecting", snapshot: null })
      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      const tick = async () => {
        try {
          const next = await collectStrata(config, controller.signal)
          if (!controller.signal.aborted) setResult(next)
        } catch {
          if (!controller.signal.aborted) setResult({ status: "Offline / invalid data", snapshot: null })
        } finally {
          if (!controller.signal.aborted) timer = setTimeout(() => { void tick() }, config.refreshMs)
        }
      }
      const remove = context.ui.slot({ append: "sidebar.content", render: () => <StrataView theme={context.theme} result={result} /> })
      void tick()
      return () => { controller.abort(); if (timer !== undefined) clearTimeout(timer); remove() }
    }
    const options = parseOptions(context.options)
    const collector = createCollector({}, { diskPath: options.diskPath, gpuIndex: options.gpuIndex })
    const [stats, setStats] = createSignal<SystemStats>(EMPTY)
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const controller = new AbortController()

    // Each tick is scheduled after the previous collection settles, so polls never overlap.
    // collect() never rejects by contract; `finally` still guarantees the next tick is scheduled.
    const poll = async () => {
      try {
        const next = await collector.collect(controller.signal)
        if (!disposed) setStats(next)
      } finally {
        if (!disposed) timer = setTimeout(fire, options.refreshMs)
      }
    }
    const fire = () => {
      poll().catch((error: unknown) => {
        if (!disposed) console.error("[opencode-system-monitor] poll failed:", error)
      })
    }
    fire()

    const removeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: () => <MonitorView theme={context.theme} stats={stats} />,
    })

    return () => {
      disposed = true
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
      removeSidebar()
    }
  },
} satisfies Plugin.Definition

export default plugin
