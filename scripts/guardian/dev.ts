/**
 * Guardian — dev entry.
 *
 * Spawns UTA → Alice → Vite in that order. UTA must hit `/__uta/health` 200
 * before Alice is spawned (Alice fails fast if `OPENALICE_UTA_URL` doesn't
 * respond on boot). Vite comes last because it only needs Alice's port for
 * its dev proxy target.
 *
 * Replaces the previous `scripts/dev.ts`. Same `pnpm dev` UX — single
 * command, auto-picked ports, hot reload via tsx watch, cascade shutdown
 * if any child exits.
 */

import type { ChildProcess } from 'node:child_process'
import { probePorts, spawnChild, waitForHttp, installCascadeShutdown } from './shared.js'

async function main(): Promise<void> {
  const ports = await probePorts()

  console.log('')
  console.log(`[guardian] UTA      →  http://127.0.0.1:${ports.utaPort}`)
  console.log(`[guardian] Alice    →  http://localhost:${ports.webPort}`)
  console.log(`[guardian] MCP      →  http://localhost:${ports.mcpPort}/mcp`)
  console.log(`[guardian] UI       →  http://localhost:5173  (Vite picks +1 if taken)`)
  console.log('')

  const baseEnv = {
    ...process.env,
    // Honor `openalice-source` export condition so backend/UTA imports hit
    // packages/*/src/*.ts directly — no pre-build needed in dev.
    NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --conditions=openalice-source`.trim(),
    // Both processes share the same `data/` root. Default `OPENALICE_HOME` /
    // user data resolution is cwd-based today; the env makes the contract
    // explicit so Step 5+ can swap the resolver.
    OPENALICE_USER_DATA_HOME: process.cwd(),
  }

  // ── UTA first ─────────────────────────────────────────────
  const uta: ChildProcess = spawnChild({
    name: 'uta',
    command: 'tsx',
    args: ['watch', 'services/uta/src/main.ts'],
    env: { ...baseEnv, OPENALICE_UTA_PORT: String(ports.utaPort) },
    prefixLogs: true,
  })

  const utaUrl = `http://127.0.0.1:${ports.utaPort}`
  const ready = await waitForHttp(`${utaUrl}/__uta/health`, { timeoutMs: 15_000 })
  if (!ready) {
    console.error(`[guardian] UTA failed to come up within 15s — aborting`)
    try { uta.kill('SIGTERM') } catch { /* noop */ }
    process.exit(1)
  }
  console.log(`[guardian] UTA ready`)

  // ── Alice ─────────────────────────────────────────────────
  const alice: ChildProcess = spawnChild({
    name: 'alice',
    command: 'tsx',
    args: ['watch', 'src/main.ts'],
    env: {
      ...baseEnv,
      OPENALICE_WEB_PORT: String(ports.webPort),
      OPENALICE_MCP_PORT: String(ports.mcpPort),
      OPENALICE_UTA_URL: utaUrl,
    },
    prefixLogs: true,
  })

  // ── Vite ──────────────────────────────────────────────────
  const vite: ChildProcess = spawnChild({
    name: 'vite',
    command: 'pnpm',
    args: ['--filter', 'open-alice-ui', 'dev'],
    env: { ...baseEnv, OPENALICE_BACKEND_PORT: String(ports.webPort) },
    prefixLogs: true,
  })

  installCascadeShutdown({ children: [uta, alice, vite] })
}

main().catch((err: unknown) => {
  console.error('[guardian] fatal:', err)
  process.exit(1)
})
