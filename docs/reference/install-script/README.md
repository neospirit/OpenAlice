# Installer Script Reference

This directory preserves a dated snapshot of the public Claude Code native
installer bootstraps. It exists so OpenAlice installer work can study a mature
cross-platform distribution design without relying on chat history or a live
upstream response that may change.

These files are reference material, not OpenAlice production code. Do not run
them from this repository, publish them as OpenAlice installers, or copy them
verbatim into the product. Reimplement accepted ideas within OpenAlice's own
security, consent, licensing, and release boundaries.

## Snapshot provenance

Captured on 2026-07-13 from the final official download URLs reached by the
documented `claude.ai` installer entry points. The files are byte-for-byte
snapshots, including upstream whitespace and the CRLF line endings in the CMD
script. The local `.gitattributes` prevents Git from normalizing those bytes or
treating upstream whitespace as OpenAlice-authored formatting errors.

| Snapshot | Official source | SHA-256 |
|---|---|---|
| [Shell](claude-code-bootstrap.sh) | <https://downloads.claude.ai/claude-code-releases/bootstrap.sh> | `b3f79015b54c751440a6488f07b1b64f9088742b9052bc1bd356d13108320d2a` |
| [PowerShell](claude-code-bootstrap.ps1) | <https://downloads.claude.ai/claude-code-releases/bootstrap.ps1> | `cd17c6b555f761d60373659824bf805e1510538226e4c7028e19d7494937a333` |
| [Windows CMD](claude-code-bootstrap.cmd) | <https://downloads.claude.ai/claude-code-releases/bootstrap.cmd> | `dff10083f59203dce263c3cae63632d7e1c37c3bee686e27f84bdf0d1ad59683` |

At capture time, the official channel pointers returned:

- `latest`: `2.1.207`
- `stable`: `2.1.197`

The public installation and integrity documentation is at
<https://code.claude.com/docs/en/installation>. Anthropic owns the upstream
material and its associated rights; retaining this snapshot does not license
it as OpenAlice or AGPL code.

## What the design does

The three bootstraps implement the same narrow pipeline in platform-native
shells:

1. Validate an optional `stable`, `latest`, or exact-version target.
2. Detect the operating system, CPU architecture, and relevant ABI details.
3. Always resolve the current `latest` Claude Code binary so installation logic
   comes from the newest installer implementation.
4. Download the matching release manifest and platform binary.
5. Verify the binary SHA-256 against the manifest.
6. Run the downloaded binary's own `install <target>` command.
7. Preserve its exit status and clean up the temporary binary.

The outer script does not own final version placement, launcher creation, PATH
integration, migration, or update policy. Those behaviors belong to the CLI
binary. This keeps the public curl/PowerShell/CMD surface small while allowing
the installer implementation to evolve with the application.

Notable platform handling includes:

- `curl` or `wget`, with optional `jq`, on macOS and Linux;
- Rosetta detection and native Apple Silicon selection;
- glibc versus musl selection on Linux;
- x64 and ARM64 selection on Windows, with explicit 32-bit rejection;
- native PowerShell and CMD paths rather than requiring Bash on Windows;
- checksum failure cleanup and install-process exit-code preservation;
- terminal recovery and a focused Linux out-of-memory explanation after a
  signal-killed install.

## OpenAlice decisions informed by this reference

Ideas to adopt:

- Keep bootstrap scripts thin and move durable install/update/doctor behavior
  behind the `openalice` CLI.
- Publish immutable release artifacts with a manifest, platform or runtime
  metadata, sizes, and SHA-256 checksums.
- Support explicit `stable`, `latest`, and exact-version channels instead of
  making a mutable development branch the public production default.
- Give PowerShell and CMD first-class entry points when native Windows CLI
  installation becomes part of the supported surface.
- Install versions side by side and switch a stable launcher only after the new
  version has passed verification.
- Clean temporary artifacts on every failure path and preserve useful native
  exit codes.

OpenAlice-specific behavior to preserve:

- Show the complete install plan before mutation and require explicit consent;
  blank input remains cancellation. The Claude Code bootstrap starts work
  immediately, which is not the desired OpenAlice onboarding contract.
- Keep Electron as a separate, complete distribution with its existing
  packaging, signing, updater, IPC, PTY, and managed-runtime behavior.
- Keep localhost startup and later SSH transport as CLI/runtime concerns, not
  responsibilities of the download bootstrap.
- Treat dependency selection as a visible, independently retryable plan rather
  than silently bundling every optional agent runtime.

Security caveat: the captured bootstraps verify a binary checksum supplied by
the downloaded manifest, but do not themselves verify the manifest's detached
GPG signature. Anthropic documents manual signature verification separately.
OpenAlice should define its release trust chain explicitly instead of assuming
that copying the checksum step alone provides artifact authenticity.

## Refreshing the snapshot

Refresh only as an intentional review change. Download the files without
executing them, inspect the diff, update the capture date/channel values and
hashes above, and explain any adopted design change in the PR.

```bash
curl -fsSL https://downloads.claude.ai/claude-code-releases/bootstrap.sh \
  -o /tmp/claude-code-bootstrap.sh
curl -fsSL https://downloads.claude.ai/claude-code-releases/bootstrap.ps1 \
  -o /tmp/claude-code-bootstrap.ps1
curl -fsSL https://downloads.claude.ai/claude-code-releases/bootstrap.cmd \
  -o /tmp/claude-code-bootstrap.cmd
shasum -a 256 /tmp/claude-code-bootstrap.*
```

Do not automate upstream refreshes. A silent snapshot update would erase the
reason this reference exists: making distribution-design changes visible and
reviewable.
