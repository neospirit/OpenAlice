# OpenAlice

File-driven AI trading agent. All state (sessions, config, logs) stored as files — no database.

## Quick Start

```bash
pnpm install
pnpm dev        # Dev mode (tsx watch, port 3002)
pnpm build      # Production build (backend + UI)
pnpm test       # Vitest
pnpm test:e2e   # e2e test
```

### Pre-commit Verification

Always run these checks before committing:

```bash
npx tsc --noEmit   # Type check (catches errors pnpm build misses)
pnpm test           # Unit tests
```

`pnpm build` uses tsup which is lenient — `tsc --noEmit` catches strict type errors that tsup ignores.

### Cross-platform note

Workspace bootstrap scripts (`src/workspaces/templates/*/bootstrap.sh`) are bash-based. On Windows they require `bash` from Git for Windows (default install) or WSL2. `workspace-creator.ts` already platform-branches the spawn so the same script paths work on win32 — when adding a new template, write bash as usual, but **don't** add POSIX-only commands without checking they ship with Git for Windows's bundled MSYS env (sed/cp/mkdir/basename/printf/source/[[ ]] all work; obscure tools like `jq` do not). See README's *Windows* section for the user-facing story.

## Subsystem guides

Some parts of this codebase are structured in ways that aren't obvious from
the code alone — easy to touch superficially, easy to miss load-bearing
wiring. When working on one of these, read its guide first:

- **Event / Listener / Producer system** — [docs/event-system.md](docs/event-system.md).
  Read before adding a new event type, Listener, or Producer, or before
  opening an event to HTTP via the webhook ingest. Has recipes + the full
  list of files to touch for each kind of change, plus a "common pitfalls"
  section for the kinds of things AI sessions have historically half-done.

## Working with TODO.md

`TODO.md` at the repo root is the running backlog — deferred work, known
bugs, security gaps, and design items sitting in the on-deck circle.
Unfinished items there compound over time if they're forgotten.

- **Before starting non-trivial work**, scan `TODO.md` for related entries.
  If there's one, either (a) handle it as part of the current change, or
  (b) confirm with the user why you're skipping it so it doesn't drift.
- **When finishing a change**, if it resolves a TODO entry, delete that
  entry in the same commit (git log is the history — the file is a
  future-looking list, not an audit trail).
- **When a new item surfaces mid-work** — a known-broken behaviour you
  don't have scope to fix, a security concern, a half-done UI surface —
  add it with enough context (symptom + suspected location) that the
  next person can start without re-derivation.

## Working with README.md

`README.md` is the public-facing positioning artifact. It accumulates
debt fast because day-to-day changes rarely feel "README-worthy"
individually — but a quarter's worth of small shifts can leave the
README narrating an obsolete mental model. The right time to audit is
**right after** a large-scale change ships, while context is fresh.

- **After finishing a large-scale change**, scan the README for sections
  that still describe the pre-change state. "Large-scale" means: a new
  top-level concept landed (e.g. Workspace, Inbox); a module was
  retired (e.g. Brain); an existing layer's responsibilities reshaped
  (e.g. Automation split into scheduling + execution); a generation
  version bump. Bug fixes, refactors that don't change user-facing
  surface, and internal renames do **not** trigger an audit.
- **Before making any README edits, ask the user how to frame the
  changes** — the README is product positioning, not just docs.
  Framing decisions ("is Automation legacy or is it reframed into two
  layers?", "is Brain retired or trimmed?") belong to the user, not to
  the AI. Present what you'd propose to change, get direction, then
  edit.
- **Don't churn marketing copy** — the three pillars, the tagline,
  the hero — leave alone unless the user explicitly opens that
  conversation. Frequent reframing of top-of-funnel copy is worse
  than slightly-stale-but-consistent copy.

## Migrations

`data/config/` and other persisted user state evolve across releases.
Any upgrade-time transformation of user data — schema changes, file
renames, orphan cleanup, value backfills — MUST go through the
migration framework at `src/migrations/`, not ad-hoc startup code.

- New migrations live at `src/migrations/NNNN_short_name/index.ts` with
  a sibling spec. Append to `src/migrations/registry.ts`, then
  `pnpm build:migration-index` regenerates `src/migrations/INDEX.md`.
- Idempotency is enforced at two layers: the journal in
  `data/config/_meta.json` and the in-body self-check. Each migration
  body must no-op when data is already at the target shape.
- For files outside `data/config/` (e.g. `data/cron/jobs.json`,
  `data/sessions/`), the migration body uses raw `fs/promises` — the
  `ctx` helpers are config-scoped. Declare the affected paths in
  `affects` for `INDEX.md` surfacing.
- Past failure to avoid: inline one-time cleanup loops in `src/main.ts`
  or subsystem bootstrap. They are easy to call against unloaded state
  and silently no-op forever — a real incident left the cron engine
  firing orphan `__snapshot__` / `__heartbeat__` jobs every 15 min for
  weeks before anyone noticed.

## Project Structure

OpenAlice is a pnpm monorepo. Two long-running processes (Alice + UTA),
supervised by Guardian, sharing one `data/` volume. Filesystem layout
roughly mirrors that split — `src/` is Alice, `services/uta/` is UTA,
`packages/` is what they wire across.

```
src/                           # Alice process — agent runtime
├── main.ts                    # Composition root
├── core/                      # Orchestration primitives. AgentCenter +
│                              #   GenerateRouter (provider selection) +
│                              #   ToolCenter + ConnectorCenter + session
│                              #   store + event-log + listener/producer.
│                              #   Workspace-scoped tool registry lives
│                              #   here too (workspace-tool-center.ts).
├── ai-providers/              # AI backend implementations.
│   ├── agent-sdk/             # Claude via @anthropic-ai/claude-agent-sdk
│   ├── codex/                 # OpenAI Codex CLI / API
│   ├── vercel-ai-sdk/         # Vercel AI SDK (Anthropic/OpenAI/Google)
│   ├── mock/                  # Test provider
│   ├── presets.ts             # Preset catalog (profile schemas)
│   └── sdk-adapters.ts        # Provider → adapter resolution
├── domain/                    # Non-broker, non-state domains.
│   ├── market-data/           # typebb in-process + OpenBB API remote
│   ├── analysis/              # Indicators / TA / sandbox
│   ├── news/                  # RSS collector + archive search
│   └── thinking/              # Safe expression evaluator
│                              # NOTE: domain/trading was ejected to
│                              # services/uta. domain/brain was retired
│                              # (migration 0006).
├── tool/                      # AI tool definitions — thin bridges from
│                              # domain → ToolCenter (trading, equity,
│                              # market, analysis, news, economy,
│                              # thinking, session, inbox-push,
│                              # notify-user). trading.ts is now a thin
│                              # HTTP-SDK wrapper, not a domain caller.
├── workspaces/                # Workspace launcher (cost-curve-inversion
│                              # mechanism, see Key Architecture). Pool
│                              # of PTY sessions, scrollback store,
│                              # template registry, CLI adapters, agent
│                              # probe, file/git services for in-workspace
│                              # ops, persistent-session reattach.
│   ├── adapters/              # claude.ts / codex.ts / shell.ts
│   └── templates/             # auto-quant, chat, finance-research
├── services/                  # Cross-cutting services Alice itself owns.
│   ├── auth/                  # Admin-token store + session-store
│   ├── uta-client/            # SDK adapters mirroring UTA's in-process
│                              #   shape: UTAManagerSDK + UTAAccountSDK
│   └── uta-supervisor/        # health probe + restart-trigger
│                              #   (flag-file protocol to Guardian)
├── connectors/                # Push channels.
│   ├── web/                   # Web UI (Hono, SSE, sub-channels)
│   ├── telegram/              # Telegram bot (grammY)
│   ├── mcp-ask/               # MCP Ask connector
│   └── mock/                  # Test connector
├── server/                    # In-process servers Alice exposes.
│   ├── mcp.ts                 # MCP protocol server
│   └── opentypebb.ts          # Mounted market-data routes
├── webui/                     # Hono web plugin internals.
│   ├── plugin.ts              # WebPlugin (bootstrap, mount order)
│   ├── middleware/            # auth.ts (admin-token gate)
│   ├── routes/                # ~23 route files; trading routes are
│                              #   BFF-proxied to UTA, not handled here
│   └── workspaces-ws.ts       # PTY WebSocket upgrade + auth gate
├── migrations/                # Versioned data migrations (0001–0006).
│                              # See `## Migrations` for the rule.
└── task/                      # cron, heartbeat, metrics

services/uta/                  # UTA process — broker carrier
├── src/main.ts                # UTA bootstrap
├── src/http/                  # routes-trading.ts + routes-simulator.ts
│                              #   (the 24 trading routes Alice's BFF
│                              #   forwards to)
└── src/domain/trading/        # ALL broker / git-state / FX / snapshot
                               #   logic lives here, not in Alice.
                               #   brokers/ contains alpaca, ccxt, ibkr,
                               #   longbridge, mock, others.

packages/                      # Shared workspace packages.
├── uta-protocol/              # @traderalice/uta-protocol — wire types
│                              #   + zod schemas + client SDK. Alice and
│                              #   UTA both depend on this; the only
│                              #   shape that crosses the process line.
├── ibkr/                      # @traderalice/ibkr — IBKR TWS port
│                              #   (UTA-owned; do not import from src/)
└── opentypebb/                # @traderalice/opentypebb — OpenBB TS port

scripts/guardian/              # L2 process supervisor.
├── dev.ts                     # `pnpm dev` entry — spawns UTA → Alice → Vite
├── prod.mjs                   # Docker entry, tini-supervised
└── shared.ts                  # Port probe, flag-watch, cascade shutdown

ui/                            # React frontend (Vite). auth/ holds the
                               # login gate; lives outside `src/` because
                               # it ships separately.

data/                          # All persistent state (gitignored).
                               # config/, sessions/, trading/, control/
                               # (UTA restart flag), backups, etc.
```

## Key Architecture

### Workspaces — the cost-curve-inversion mechanism

`src/workspaces/` is OpenAlice's most important architectural surface and
the reason recent feature work has been compounding cheaply. A workspace
is a managed, persistent shell session (PTY-backed, scrollback-replayed,
template-bootstrapped) inside which an AI agent runs an entire capability
end-to-end — research, quant iteration, auto-galgame-style harnesses,
etc. The launcher itself stays small; new capabilities ship as new
templates and satellite repos rather than new code paths inside Alice.

Why this layer matters more than the rest:

- **Linear complexity, exponential value.** Each new capability is an
  isolated workspace; the only thing Alice's core has to grow is the
  scheduler. The dead-end alternative — adding workflow abstractions for
  every capability inside `src/` — produced exponential complexity for
  linear value, and is the reason the old chat-hook layer burned ~50% of
  development time before this pivot.
- **Sandboxable.** Workspaces map cleanly to cloud sandboxes and to
  parallel agents; you can run 20 of them.
- **Boundary discipline.** A workspace is the natural unit at which to
  decide "AI handles this autonomously" vs "human must approve."

Practical implication: when adding agent-facing capability, default to
**new template / new satellite repo**, not new `src/` modules. See
memory `feedback_workspace_as_capability_boundary` and
`project_satellite_repo_ecosystem`.

Load-bearing files: `service.ts` (lifecycle), `session-pool.ts` (PTYs),
`session-registry.ts` (persistence), `scrollback-store.ts` (replay),
`template-registry.ts` (templates), `adapters/{claude,codex,shell}.ts`
(CLI wiring), `protocol.ts` (UI ↔ workspace wire shape).

### Alice ↔ UTA split

The broker domain runs as a separate process. Alice owns the agent
runtime; UTA owns broker connections, git-like trade approval state, FX,
snapshots, and all `IBroker` implementations. They communicate over HTTP
via `@traderalice/uta-protocol` (the only shape that crosses the line).
Today they're co-located on `127.0.0.1`; the protocol exists so UTA can
detach to a separate device (hardware-wallet-style) without rewriting
either side.

Concretely:

- `services/uta/src/domain/trading/` is the only place broker code lives.
- `src/services/uta-client/` (UTAManagerSDK / UTAAccountSDK) mirrors UTA's
  in-process interfaces, so the tool layer (`tool/trading.ts`) reads as
  if it were calling local code.
- Alice's `/api/trading/*` routes are BFF-proxied to UTA.
- Config changes that affect UTA go through a flag-file restart protocol
  (`data/control/restart-uta.flag`, watched by Guardian). UTA itself has
  no in-process hot-reload — startup path == restart path.

### AI provider layer (in flight — calling shape will change)

> ⚠️ This section describes the current wiring, not the destination.
> The provider routing layer is destined for redesign — the cross-shape
> assumptions between Anthropic-API-shape and OpenAI-API-shape backends
> are leaking, and the registry pattern needs rework. Before adding a
> new provider or changing routing behavior, **check with the user
> first.** See memory `feedback_no_bandaid_on_shape_mismatch`.

Today:

- **AgentCenter** (`core/agent-center.ts`) — top-level orchestration.
  Manages sessions, compaction, routes through GenerateRouter. Exposes
  `ask()` (stateless) and `askWithSession()` (with history).
- **GenerateRouter** (`core/ai-provider-manager.ts`) — reads
  `ai-provider.json`, resolves to the active provider. Four backends
  registered today: `agent-sdk` (Claude), `codex` (OpenAI Codex),
  `vercel-ai-sdk` (Anthropic / OpenAI / Google), `mock`.
- **AIProvider interface**: `ask(prompt)` one-shot, `generate(input, opts)`
  streams `ProviderEvent`s (`tool_use` / `tool_result` / `text` / `done`).
  Optional `compact()` for provider-native compaction.
- **StreamableResult**: dual interface — `PromiseLike` (await for result)
  + `AsyncIterable` (for-await for streaming). Multiple consumers each
  get independent cursors.
- Per-request overrides via `AskOptions.provider` and the per-backend
  option blocks (`AskOptions.vercelAiSdk`, `AskOptions.agentSdk`, etc.).

### ConnectorCenter

`core/connector-center.ts` manages push channels (Web, Telegram,
MCP Ask). Tracks last-interacted channel for delivery routing.

### ToolCenter

Centralized registry. Files under `src/tool/` register tools via
`ToolCenter.register()`; exports in both Vercel-tool and MCP shapes.
Decoupled from AgentCenter. Workspace-scoped tool registration goes
through `core/workspace-tool-center.ts` (per-workspace MCP exposure
without polluting the global tool list).

## Conventions

- ESM only (`.js` extensions in imports), path alias `@/*` → `./src/*`
- Strict TypeScript, ES2023 target
- Zod for config, TypeBox for tool parameter schemas
- `decimal.js` for financial math
- Pino logger → `logs/engine.log`

## Git Workflow

- `origin` = `TraderAlice/OpenAlice` (production)
- `dev` branch for all development, `master` only via PR
- **Never** force push master, **never** push `archive/dev` (contains old API keys)
- CLAUDE.md is **committed to the repo and publicly visible** — never put API keys, personal paths, or sensitive information in it

### Branch Safety Rules

- **NEVER delete `dev` or `master` branches** — both are protected on GitHub (`allow_deletions: false`, `allow_force_pushes: false`)
- When merging PRs, **NEVER use `--delete-branch`** — it deletes the source branch and destroys commit history
- When merging PRs, **prefer `--merge` over `--squash`** — squash destroys individual commit history. If the PR has clean, meaningful commits, merge them as-is
- If squash is needed (messy history), do it — but never combine with `--delete-branch`
- `archive/dev-pre-beta6` is a historical snapshot — do not modify or delete
- **After merging a PR**, always `git pull origin master` to sync local master. Stale local master causes confusion about what's merged and what's not.
- **Before creating a PR**, always `git fetch origin master` to check what's already merged. Use `git log --oneline origin/master..HEAD` to verify only the intended commits are ahead. Stale local refs cause PRs with wrong diff.

### Rolling dev → master PR convention

Multiple Claude sessions hit `dev` in parallel; GitHub allows only **one
open PR per (head, base) pair** anyway. So we keep a single rolling PR
from `dev → master` and **append** to its body each session instead of
opening fresh — otherwise each new PR loses the context of what other
sessions did.

**Before opening a new PR, always check first:**

```bash
gh pr list --base master --head dev --state open --json number,title,body
```

- **If a PR exists** → append your section to its body with
  `gh pr edit <num> --body-file <(...)`. Don't open a new one.
- **If none exists** → open with `gh pr create` using the template below.

**PR body template:**

```markdown
## Summary
<rolling thematic summary — latest session may rewrite this when new
work meaningfully shifts the PR's framing>

## Per-session contributions
### YYYY-MM-DD — <session theme, e.g. "Market workbench tradeable card">
- What changed (1–3 bullets)
- Why
- Key commits: `<sha-short>`, `<sha-short>`

### YYYY-MM-DD — <prior session theme>
…(append on top, keep prior sessions verbatim — never edit other sessions' entries)…

## Full commit log
<output of: git log --oneline origin/master..HEAD>
(regenerate from scratch on each body update)

## Test plan
- [ ] tsc --noEmit clean
- [ ] pnpm test passes
- [ ] (session-specific manual verifications)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**When you append:**

1. Refresh the "Full commit log" section from `git log --oneline origin/master..HEAD`.
2. Add your "Per-session contributions" entry on top of the list, with today's date.
3. Don't edit other sessions' entries — that's their record.
4. Update "Summary" only if your work actually changes the PR's framing
   (e.g., what was a "frontend tweak" PR becomes a "frontend + new domain
   service" PR after your work).

This keeps the PR description as a faithful audit trail across sessions,
and lets reviewers see who-did-what without trawling the commit log alone.

### Default vs. isolated branch — when to deviate from `dev`

The default for any session is **work on `dev`** and let the rolling
PR carry it to master. The exception is **invasive, long-running work
that shouldn't share a branch with parallel sessions** — typically a
refactor of shared types / cross-cutting infrastructure that, while
in-flight, would force every other session to rebase against churn
they don't have context for.

Examples worth isolating: changing a base interface every broker
implements; renaming or restructuring a module everyone imports from;
multi-day schema migrations.
Examples that stay on `dev`: any feature, any local fix, anything
scoped to one subsystem.

When isolation is the right call:

```bash
# Branch from master (clean baseline, dev's churn won't bleed in)
git fetch origin
git checkout master
git pull origin master
git checkout -b refactor/<short-name>

# During the refactor, periodically rebase against master so the
# eventual merge stays small. Skip dev — its session-by-session
# churn is intentionally not part of the baseline you're testing
# against.
git fetch origin
git rebase origin/master

# When done, PR straight to master (NOT dev). The refactor is its own
# coherent unit, reviewed end-to-end.
git push -u origin refactor/<short-name>
gh pr create --base master --head refactor/<short-name> ...
```

**After the refactor merges**, dev needs to absorb the new master so
in-flight sessions land on the new baseline:

```bash
git checkout dev
git pull origin dev
git fetch origin
git merge origin/master
git push origin dev
```

In-flight rolling-PR work then sees the refactor in their next pull
and rebases naturally. Their diffs against the refreshed `dev` may
need real fix-ups (that's the cost of an invasive refactor — and
the reason you isolated it in the first place).

**Decision rule for the next session that starts work:** if `master`
is currently ahead of `dev`, do `git checkout dev && git merge origin/master`
*before* starting any new feature work. Otherwise your new commits
will land on a stale baseline.

Common reasons `master` would be ahead of `dev`:
- An invasive refactor branch just landed (above flow).
- A Claude Code cloud session opened a `claude/<short-desc>-XXXXX`
  branch and merged it straight to master without going through `dev`
  — typically for a time-sensitive fix the cloud agent shipped while
  the human wasn't around (see next subsection).

When the side-channel was content-bearing (not just a refactor) **dev
is genuinely behind master in code**, not just in merge-commit objects.
Skipping the sync lands new dev commits on stale code.

One quirk to recognize: a single `git merge origin/master` into dev
often surfaces a Discord/webhook notification like *"N new commits on
dev"* where N is much larger than what the side branch actually added.
Most of those N are **historical PR-merge commits** that have been
accumulating on master for weeks (each dev → master PR creates a
merge commit that exists only on master). The sync drags them onto
dev in one go. The webhook reports commit-object count, not
content-delta. Expected, not a sign anything's broken.

### Emergency hotfix via cloud `claude/*` side branch

A Claude Code cloud session can open a branch named
`claude/<short-desc>-XXXXX`, PR straight to master, and merge it
without touching `dev`. This is the right move for **genuine
emergencies** the user isn't around to handle on dev (a runtime
error blocking users, a CORS misconfiguration, a hotfix that can't
wait for the next dev → master cycle). The cloud session uses it
because:

- Cloud sessions don't see in-flight local dev state and shouldn't
  destabilize it
- The fix is small and reviewable in isolation
- Waiting for the user to bounce dev for a hotfix is silly when the
  cloud agent already has a working tree

**What this means for the next local session:**

1. `git fetch origin && git log --oneline origin/dev..origin/master`
   shows commits master has that dev doesn't — if there's anything
   from a `claude/*` branch, dev needs the sync.
2. `git checkout dev && git merge origin/master && git push origin dev`
   (clean FF in typical case).
3. Resume normal work on dev.

**What this means for the cloud session deciding whether to side-branch:**
default to opening a dev → master PR like everyone else. Only branch
straight to master for fixes that meet *both*: (a) production-impacting
or user-blocking, and (b) sub-100-line scope reviewable end-to-end in
one sitting. Anything bigger or speculative goes through dev.

**Parallel work happens in the cloud, not in local worktrees.** For a
project this size, spinning up multiple local worktrees costs more
in `pnpm install` / `data/` copying / port juggling than it saves.
Hand parallel tracks off to cloud Claude sessions instead — each
gets its own sandbox, returns a PR, and doesn't touch the local
working tree.
