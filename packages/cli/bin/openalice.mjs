#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import { connectSsh, formatSshHelp, parseSshConnectArgs } from '../src/ssh-connect.mjs'

export async function main(argv = process.argv.slice(2)) {
  const [command, ...args] = argv
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(formatHelp())
    return 0
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    process.stdout.write(`${readVersion()}\n`)
    return 0
  }
  if (command !== 'ssh') {
    throw new Error(`Unknown command: ${command}\n\n${formatHelp()}`)
  }
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(formatSshHelp())
    return 0
  }
  return connectSsh(parseSshConnectArgs(args))
}

function formatHelp() {
  return `OpenAlice CLI

Usage:
  openalice ssh <user@host> [options]

Commands:
  ssh       Open a loopback-only SSH tunnel to an already-running OpenAlice

Run "openalice ssh --help" for connection options.
`
}

function readVersion() {
  const packageUrl = new URL('../package.json', import.meta.url)
  return JSON.parse(readFileSync(packageUrl, 'utf8')).version
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().then(
    (code) => { process.exitCode = code },
    (error) => {
      process.stderr.write(`openalice: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
