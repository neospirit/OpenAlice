# Installer Script Reference

This note keeps the context behind OpenAlice installer design work without
vendoring Claude Code source. Local script snapshots in this directory are
ignored by Git and must not be committed or distributed with OpenAlice.

Official upstream entry points, inspected on 2026-07-13:

- Shell: <https://downloads.claude.ai/claude-code-releases/bootstrap.sh>
- PowerShell: <https://downloads.claude.ai/claude-code-releases/bootstrap.ps1>
- Windows CMD: <https://downloads.claude.ai/claude-code-releases/bootstrap.cmd>
- Installation documentation: <https://code.claude.com/docs/en/installation>

At inspection time, `latest` was `2.1.207` and `stable` was `2.1.197`.

The useful design boundary is a thin platform-native bootstrap that detects the
platform, resolves a release, verifies its checksum, and delegates durable
installation to the CLI's own `install` command. Version placement, launcher
switching, PATH integration, updates, migrations, and diagnostics stay in the
CLI rather than growing inside curl/PowerShell/CMD scripts.

OpenAlice should independently implement that architecture while preserving
its visible install plan and explicit consent. Electron remains a separate,
complete distribution, and release authenticity needs an explicit trust chain
beyond copying a manifest checksum pattern.
