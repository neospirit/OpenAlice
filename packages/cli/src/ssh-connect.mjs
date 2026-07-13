import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const LOOPBACK = '127.0.0.1'

export function parseSshConnectArgs(argv) {
  const options = {
    destination: '',
    localPort: 0,
    remotePort: 47331,
    sshPort: null,
    identityFile: null,
    openBrowser: true,
    waitMs: 60_000,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--') continue
    if (arg === '--no-open') {
      options.openBrowser = false
      continue
    }
    if (arg === '--local-port') {
      options.localPort = parsePort(requireValue(argv, ++index, arg), arg, { allowAuto: true })
      continue
    }
    if (arg === '--remote-port') {
      options.remotePort = parsePort(requireValue(argv, ++index, arg), arg)
      continue
    }
    if (arg === '--ssh-port') {
      options.sshPort = parsePort(requireValue(argv, ++index, arg), arg)
      continue
    }
    if (arg === '--identity') {
      options.identityFile = requireValue(argv, ++index, arg)
      continue
    }
    if (arg === '--wait') {
      const seconds = Number(requireValue(argv, ++index, arg))
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) {
        throw new Error('--wait must be a number of seconds between 1 and 600')
      }
      options.waitMs = Math.round(seconds * 1_000)
      continue
    }
    if (arg?.startsWith('-')) throw new Error(`Unknown option: ${arg}`)
    if (options.destination) throw new Error(`Unexpected argument: ${arg}`)
    options.destination = arg ?? ''
  }

  if (!options.destination) throw new Error('SSH destination is required (for example: user@example.com)')
  if (/\s|[\u0000-\u001f\u007f]/.test(options.destination) || options.destination.startsWith('-')) {
    throw new Error('SSH destination contains unsupported characters')
  }
  return options
}

export function buildSshArgs(options, localPort) {
  const args = [
    '-N',
    '-T',
    '-o', 'ExitOnForwardFailure=yes',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ServerAliveCountMax=3',
  ]
  if (options.sshPort !== null) args.push('-p', String(options.sshPort))
  if (options.identityFile !== null) args.push('-i', options.identityFile)
  args.push(
    '-L', `${LOOPBACK}:${localPort}:${LOOPBACK}:${options.remotePort}`,
    options.destination,
  )
  return args
}

export async function connectSsh(options, dependencies = {}) {
  const allocatePort = dependencies.allocatePort ?? allocateLoopbackPort
  const spawnProcess = dependencies.spawnProcess ?? spawn
  const waitForRuntime = dependencies.waitForRuntime ?? waitForOpenAlice
  const launchBrowser = dependencies.launchBrowser ?? openBrowser
  const stdout = dependencies.stdout ?? process.stdout
  const localPort = options.localPort || await allocatePort()
  const localUrl = `http://${LOOPBACK}:${localPort}`
  const ssh = spawnProcess('ssh', buildSshArgs(options, localPort), {
    stdio: ['inherit', 'ignore', 'inherit'],
    windowsHide: true,
  })

  let ready = false
  const earlyFailure = new Promise((_, reject) => {
    ssh.once('error', (error) => reject(error))
    ssh.once('exit', (code, signal) => {
      if (!ready) reject(new Error(`SSH tunnel exited before OpenAlice was ready (code=${String(code)}, signal=${String(signal)})`))
    })
  })

  try {
    await Promise.race([
      waitForRuntime(localUrl, { timeoutMs: options.waitMs }),
      earlyFailure,
    ])
    ready = true
    stdout.write(`OpenAlice remote runtime: ${options.destination}\n`)
    stdout.write(`Local OpenAlice UI: ${localUrl}\n`)
    stdout.write('The SSH tunnel stays active until this command exits. Press Ctrl+C to close it.\n')
    if (options.openBrowser) await launchBrowser(localUrl)
    return await holdTunnel(ssh)
  } catch (error) {
    ssh.kill('SIGTERM')
    throw error
  }
}

export async function allocateLoopbackPort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: LOOPBACK, port: 0, exclusive: true }, resolve)
  })
  const address = server.address()
  const port = address && typeof address === 'object' ? address.port : 0
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (!port) throw new Error('Could not reserve a local loopback port')
  return port
}

export async function waitForOpenAlice(baseUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 60_000
  const pollMs = options.pollMs ?? 250
  const deadline = Date.now() + timeoutMs
  let lastError = 'connection refused'

  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`${baseUrl}/api/auth/status`, {
        signal: AbortSignal.timeout(Math.min(2_000, Math.max(250, deadline - Date.now()))),
      })
      if (response.ok) {
        const body = await response.json()
        if (typeof body?.authed === 'boolean' && typeof body?.tokenConfigured === 'boolean') return body
        lastError = 'unexpected response from /api/auth/status'
      } else {
        lastError = `HTTP ${response.status}`
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
  throw new Error(`OpenAlice did not become ready at ${baseUrl} within ${Math.ceil(timeoutMs / 1_000)}s (${lastError}). Start OpenAlice on the remote host first.`)
}

export async function openBrowser(url, options = {}) {
  const platform = options.platform ?? process.platform
  const spawnProcess = options.spawnProcess ?? spawn
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd.exe' : 'xdg-open'
  const args = platform === 'win32' ? ['/d', '/s', '/c', 'start', '', url] : [url]
  const child = spawnProcess(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.once?.('error', () => undefined)
  child.unref()
}

export function formatSshHelp() {
  return `Usage:
  openalice ssh <user@host> [options]

Connects the local browser to an OpenAlice instance that is already running on
the SSH host. The local listener and remote target are both fixed to 127.0.0.1.

Options:
  --local-port <port|auto>  Local tunnel port (default: auto)
  --remote-port <port>      OpenAlice web port on the remote host (default: 47331)
  --ssh-port <port>         SSH server port
  --identity <path>         SSH identity file
  --wait <seconds>          Readiness timeout, 1-600 (default: 60)
  --no-open                 Print the URL without opening a browser
  -h, --help                Show this help
`
}

function holdTunnel(ssh) {
  if (ssh.exitCode !== undefined && (ssh.exitCode !== null || ssh.signalCode !== null)) {
    return Promise.resolve(ssh.exitCode ?? 0)
  }
  return new Promise((resolve) => {
    const stop = () => ssh.kill('SIGTERM')
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    ssh.once('exit', (code) => {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      resolve(code ?? 0)
    })
  })
}

function requireValue(argv, index, flag) {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parsePort(raw, flag, options = {}) {
  if (options.allowAuto && raw === 'auto') return 0
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${flag} must be an integer between 1 and 65535${options.allowAuto ? ', or auto' : ''}`)
  }
  return value
}
