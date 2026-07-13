# Connector Service

This guide owns OpenAlice external-notification connectors: process boundaries,
configuration, delivery guarantees, adapter extension, health, and packaging.
It complements [[docs/workspace-issues-and-scheduling.md]] and
[[docs/managed-workspace-runtime.md]].

## Product Contract

Connector Service projects durable OpenAlice Inbox entries into optional
external chats. It is not another agent runtime, chat input loop, or source of
truth. Telegram and Discord are the first adapters, not hard-coded product
categories.

- Local Inbox append completes before any external request begins.
- A failed connector never changes `inbox_push` success and never marks an
  Inbox item read.
- The service is optional in every trading mode, including lite.
- Guardian may start, stop, or restart it without restarting Alice or UTA.
- Version 1 is outbound-only. `/link`, `/status`, and `/test` reserve a generic
  slash-command control plane; ordinary DM text is not ingested.
- Each adapter serves one owner account/private chat. Group and channel
  broadcasting are out of scope.

## Topology

```text
Workspace agent
  -> inbox_push
  -> InboxStore durable JSONL append
  -> non-blocking Alice bridge
  -> Connector Service on loopback
       -> adapter registry
          -> Discord Connector
          -> Telegram Connector
          -> future adapter
```

Load-bearing paths:

- `packages/connector-protocol/` — shared schemas, definitions, public config,
  delivery and health client.
- `services/connector/src/core/` — adapter/command registry and isolated
  delivery manager.
- `services/connector/src/adapters/` — one file per platform implementation.
- `src/core/connector-config.ts` — sealed config and Guardian enable/restart
  control.
- `src/services/connector-client/` — Inbox projection and Alice-side health.
- `src/webui/routes/connectors.ts` + `ui/src/pages/ConnectorsPage.tsx` — generic
  Settings surface.

## Configuration and Secrets

`data/config/connector-service.json` contains only `{ "enabled": boolean }` so
Guardian can decide whether to run the process without decrypting platform
credentials. `data/config/connectors.json` is an AES-256-GCM sealed envelope;
the machine key remains at `<OPENALICE_HOME>/sealing.key` outside portable
`data/`.

The Settings API never returns a bot token. It returns field definitions,
non-secret values, and `configuredSecrets` presence markers. Saving an empty
secret keeps the stored value; explicitly removing its presence clears it.
Changes touch `data/control/restart-connector.flag`, and Guardian reconciles the
process from the same startup path.

Migration `0022_connector_service_config` moves the retired `web.port` value to
`ports.json`, discards removed MCP-Ask state, converts the first legacy Telegram
private chat into the single-owner adapter shape, and seals the token.

## Adapter Extension Rule

Core dispatch must not branch on platform IDs. Adding a connector means:

1. add a `ConnectorDefinition` (fields and slash-command metadata);
2. implement `ConnectorAdapter` in its own file/package;
3. register its factory at service composition;
4. add adapter-specific tests and packaging dependencies.

The Settings renderer consumes definitions as data. The DeliveryManager test
registers a fake third adapter to prevent a future Discord/Telegram union or
`if (id === ...)` dispatch from becoming the architecture.

## Platform Setup

Discord uses a user-installed application with slash commands scoped to the
app DM context. No guild/channel is required and raw DM messages are not read.
The owner runs `/link` in the app DM, then OpenAlice stores that Discord user
ID. Telegram uses private-chat long polling; the owner starts the bot and runs
`/link`, which stores the matching user and chat IDs.

Saving valid bot credentials does not mean the connector is linked. Settings
must present the lifecycle explicitly: credentials ready, bot online and
`awaiting_link`, then linked/healthy. Starting the linking step enables the
optional Connector Service and that adapter so the external bot can actually
receive `/link`; owner/chat fields learned by the command are lifecycle output,
not ordinary operator-entered configuration.

Both adapters reject commands from any account other than the linked owner.
Use `/status` for adapter health and `/test` for an explicit delivery check.

## Health Contract and Tests

UTA and Connector Service are both optional external services. Alice probes
them through the same health contract and reports one of three phases:

- `disabled`: intentionally switched off; no network request is made.
- `healthy`: the endpoint returned 2xx and its service-specific body passed
  schema validation.
- `degraded`: enabled but not configured, unreachable, timed out, returned a
  non-2xx response, or returned an invalid body.

Each probe also records a stable reason code, check timestamp, and latency. A
failed optional-service probe must never change Alice or Inbox availability.
An adapter in `awaiting_link` is online and intentionally incomplete, so it does
not degrade the service; external notification delivery becomes healthy only
after the owner runs `/link`.
The contract matrix lives in `src/services/optional-carrier/health.spec.ts`;
`integrations.spec.ts` applies it to the real UTA and Connector response shapes.
Guardian/process smoke tests remain responsible for proving that an enabled
service actually starts and reaches its health endpoint.

## Two-Layer External Acceptance

External SDKs cannot be closed-loop tested by treating a successful HTTP call
as proof that a human-visible DM arrived. Connector acceptance therefore has
two explicit layers.

### Layer 1: recorded contract replay

Connector Service writes a bounded, private JSONL journal to
`data/logs/connector-io.jsonl` (one rotated generation at `.1`). It records:

- complete normalized Inbox notifications at service ingress;
- per-adapter delivery attempt, success, or failure tied to one correlation ID;
- inbound slash-command name and pseudonymized user/chat IDs;
- command replies and command failures.

Bot tokens are never journaled. Platform user and chat IDs are stable SHA-256
pseudonyms so authorization/equality cases remain replayable without retaining
raw external identifiers. Notification text is retained because it is the
payload under test; the journal is mode `0600`, bounded to 5 MiB, and remains
local to the OpenAlice data home.

`services/connector/test-fixtures/io-smoke.jsonl` is a safe fixture. The replay
harness consumes only `notification.received` events and runs them through a
fake adapter; recorded success/failure events are evidence and are never
mistaken for new inputs. The real process smoke also waits for its accepted
notification to appear in the journal. Run `pnpm test:connector-replay` for the
offline fixture lane and `pnpm test:connector-service` after building the
service for the real-process/journal lane.

### Layer 2: opt-in web DM confirmation

When the operator explicitly permits external-account testing and a signed-in
browser profile is available:

1. use **Send test** in Connector Settings and copy its unique
   `connector-probe-xxxxxxxx` ID;
2. open the linked owner's Discord Web or Telegram Web private bot chat;
3. confirm the exact probe ID appears once in the DM;
4. send `/status` and confirm a reply, then verify matching
   `command.received` and `command.replied` journal events;
5. record the lane as passed, failed, or skipped with a reason.

Browser confirmation is never run silently: it touches an external account and
creates messages. Without permission, credentials, and a signed-in owner
session, this layer must be reported as **skipped**, not passed. Platform web UI
automation is an acceptance aid, not a CI dependency.

## Acceptance

Changes to this subsystem require:

- protocol/service typecheck and adapter registry tests;
- recorded I/O fixture replay and journal privacy/rotation tests;
- an isolated Connector Service process health + accepted-delivery smoke;
- proof that Inbox append succeeds when Connector Service is absent;
- Settings browser verification without exposing token values;
- dev Guardian enable/restart/disable recovery under an isolated
  `OPENALICE_HOME`;
- Docker build/runtime smoke and packaged Electron resource assertion.

Real Telegram/Discord delivery needs user-owned platform credentials and is a
manual acceptance lane; credential-free CI must not pretend that a live
third-party message was delivered.
