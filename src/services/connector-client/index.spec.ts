import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InboxNotification } from '@traderalice/connector-protocol'
import { createMemoryInboxStore } from '../../core/inbox-store.js'
import {
  attachInboxConnectorBridge,
  projectInboxAttachments,
  toNotification,
} from './index.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Inbox Connector bridge', () => {
  it('does not make a durable Inbox append wait for external delivery', async () => {
    let rejectDelivery!: (error: Error) => void
    const delivery = new Promise<void>((_resolve, reject) => { rejectDelivery = reject })
    const push = vi.fn(() => delivery)
    const warn = vi.fn()
    const store = createMemoryInboxStore()
    attachInboxConnectorBridge(store, {
      isEnabled: async () => true,
      push,
      warn,
    })

    const entry = await store.append({ workspaceId: 'ws-1', comments: 'done' })
    expect(entry.comments).toBe('done')
    await vi.waitFor(() => expect(push).toHaveBeenCalledOnce())

    rejectDelivery(new Error('external IM offline'))
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('external IM offline'))
  })

  it('projects bounded Inbox provenance without tool logs', () => {
    const notification = toNotification({
      id: 'entry-1',
      ts: 1_700_000_000_000,
      workspaceId: 'ws-1',
      workspaceLabel: 'Research',
      comments: 'Read the report.',
      docs: [{ path: 'research/close.md' }],
      origin: { kind: 'headless', resumeId: 'resume-calm-river-12ab', agent: 'pi' },
    })
    expect(notification).toMatchObject({
      title: 'Inbox update from Research',
      body: 'Read the report.\n\nReports:\n- research/close.md',
      provenance: { resumeId: 'resume-calm-river-12ab', actorLabel: 'pi' },
    })
  })

  it('delivers Markdown docs as bounded file attachments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openalice-connector-attachment-'))
    tempDirs.push(root)
    await mkdir(join(root, 'research'))
    await writeFile(join(root, 'research', 'close.md'), '# Close scan\n')
    const push = vi.fn(async (_notification: InboxNotification) => undefined)
    const store = createMemoryInboxStore()
    attachInboxConnectorBridge(store, {
      isEnabled: async () => true,
      push,
      warn: vi.fn(),
      resolveWorkspace: () => ({ dir: root }),
    })

    await store.append({
      workspaceId: 'ws-1',
      docs: [{ path: 'research/close.md' }],
      comments: 'Attached without flattening the report.',
    })

    await vi.waitFor(() => expect(push).toHaveBeenCalledOnce())
    const notification = push.mock.calls[0]?.[0]
    expect(notification?.attachments).toHaveLength(1)
    expect(notification?.attachments?.[0]).toMatchObject({
      filename: 'close.md',
      mediaType: 'text/markdown; charset=utf-8',
      sizeBytes: Buffer.byteLength('# Close scan\n'),
    })
    expect(Buffer.from(notification!.attachments![0]!.contentBase64, 'base64').toString('utf8'))
      .toBe('# Close scan\n')
  })

  it('refuses to attach a Markdown symlink that escapes the Workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openalice-connector-workspace-'))
    const outside = await mkdtemp(join(tmpdir(), 'openalice-connector-outside-'))
    tempDirs.push(root, outside)
    await writeFile(join(outside, 'secret.md'), '# outside\n')
    await symlink(join(outside, 'secret.md'), join(root, 'leak.md'))
    const warn = vi.fn()

    const attachments = await projectInboxAttachments({
      id: 'entry-escape',
      ts: Date.now(),
      workspaceId: 'ws-1',
      docs: [{ path: 'leak.md' }],
    }, () => ({ dir: root }), warn)

    expect(attachments).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('symlink target escapes Workspace'))
  })
})
