/**
 * Guardian shared module — L2 process supervisor.
 *
 * Guardian is OpenAlice's L2 authority (see memory:port-architecture-3-layers).
 * Three carriers, one set of L2 responsibilities:
 *   - dev:    `scripts/guardian/dev.ts`, spawned by `pnpm dev`
 *   - prod:   `scripts/guardian/prod.mjs`, container CMD (Step 7)
 *   - desktop: Electron `main` process (future)
 *
 * Responsibilities (this module):
 *   - port probing
 *   - child-process spawning (UTA / Alice / Vite) with env injection
 *   - HTTP readiness gates (`waitForHttp`)
 *   - signal forwarding + cascade shutdown
 *   - log line prefixing (dev only)
 *
 * Step 4 will add: watching `data/control/restart-uta.flag` so Guardian
 * SIGTERMs + respawns UTA without restarting Alice.
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { probeFreePort } from '../probe-port.js'

export interface GuardianPorts {
  webPort: number
  mcpPort: number
  utaPort: number
}

/** Probe all three ports starting from defaults. Returns triple. */
export async function probePorts(opts: {
  webStart?: number
  utaStart?: number
} = {}): Promise<GuardianPorts> {
  const webStart = opts.webStart ?? 47331
  const utaStart = opts.utaStart ?? 47333
  const webPort = await probeFreePort(webStart)
  const mcpPort = await probeFreePort(webPort + 1)
  const utaPort = await probeFreePort(Math.max(utaStart, mcpPort + 1))
  return { webPort, mcpPort, utaPort }
}

export interface SpawnSpec {
  name: 'uta' | 'alice' | 'vite'
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  /** When true, pipe stdout/stderr through this process with a `[name] `
   *  prefix on every line. Default true in dev, false in prod. */
  prefixLogs: boolean
}

export function spawnChild(spec: SpawnSpec): ChildProcess {
  const child = spawn(spec.command, spec.args, {
    env: spec.env,
    stdio: spec.prefixLogs ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  } satisfies SpawnOptions)

  if (spec.prefixLogs) {
    const tag = `[${spec.name}] `
    child.stdout?.on('data', (buf: Buffer) => writePrefixed(process.stdout, buf, tag))
    child.stderr?.on('data', (buf: Buffer) => writePrefixed(process.stderr, buf, tag))
  }
  return child
}

function writePrefixed(stream: NodeJS.WriteStream, buf: Buffer, tag: string): void {
  const lines = buf.toString('utf8').split('\n')
  // Last element is "" when buf ended with \n; preserve that the right way
  // so partial mid-line writes aren't mangled with mid-stream prefixes.
  for (let i = 0; i < lines.length - 1; i++) {
    stream.write(tag + lines[i] + '\n')
  }
  // Trailing partial line (no terminating \n) goes through without prefix —
  // it'll get prefixed when the next chunk completes the line. Good enough
  // for dev orchestration; not a contract.
  if (lines[lines.length - 1] !== '') {
    stream.write(tag + lines[lines.length - 1])
  }
}

/**
 * Poll an HTTP URL until it returns 200, or until timeout. Returns true
 * if the URL became ready, false on timeout. Used by Guardian to gate
 * Alice startup on UTA `/__uta/health` being live.
 */
export async function waitForHttp(url: string, opts: {
  timeoutMs: number
  intervalMs?: number
}): Promise<boolean> {
  const interval = opts.intervalMs ?? 100
  const deadline = Date.now() + opts.timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return true
    } catch { /* not ready yet */ }
    await sleep(interval)
  }
  return false
}

/** Cascade-shutdown supervisor — kills all tracked children on signal or
 *  unexpected child exit, then exits itself. Idempotent (safe to call
 *  twice on rapid SIGINT or child crash + signal race). */
export interface CascadeOpts {
  children: ChildProcess[]
  /** Grace period before SIGKILL fallback. */
  graceMs?: number
}

export function installCascadeShutdown(opts: CascadeOpts): () => void {
  let stopping = false
  const graceMs = opts.graceMs ?? 5_000

  const shutdown = (): void => {
    if (stopping) return
    stopping = true
    for (const c of opts.children) {
      if (c.exitCode === null && !c.killed) {
        try { c.kill('SIGTERM') } catch { /* noop */ }
      }
    }
    setTimeout(() => {
      for (const c of opts.children) {
        if (c.exitCode === null && !c.killed) {
          try { c.kill('SIGKILL') } catch { /* noop */ }
        }
      }
      process.exit(0)
    }, graceMs).unref()
  }

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, shutdown)
  }
  for (const child of opts.children) {
    child.once('exit', (code, signal) => {
      if (stopping) return
      console.log(`[guardian] ${childTag(child, opts.children)} exited (code=${code}, signal=${signal}) — cascading shutdown`)
      shutdown()
    })
  }

  return shutdown
}

function childTag(c: ChildProcess, _all: ChildProcess[]): string {
  // Minimal tagging — argv hint when available. Refined naming requires
  // wrapping spawnChild + tracking spec metadata; not worth it for log lines.
  const cmd = c.spawnargs[0] ?? '?'
  return cmd
}
