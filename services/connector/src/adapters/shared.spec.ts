import { describe, expect, it } from 'vitest'
import type { InboxNotification } from '@traderalice/connector-protocol'
import { AdapterHealthTracker, formatInboxNotification, formatPlainInboxNotification } from './shared.js'

const notification: InboxNotification = {
  id: 'fixture-1',
  createdAt: '2026-07-13T00:00:00.000Z',
  workspaceId: 'ws-1',
  workspaceLabel: 'Research *desk*',
  title: 'Close [scan]',
  body: 'Three findings.',
  provenance: { resumeId: 'resume-calm-river-12ab' },
  href: 'https://openalice.example/inbox',
}

describe('recorded Inbox payload formatting', () => {
  it('replays deterministically into Discord markdown', () => {
    expect(formatInboxNotification(notification)).toBe([
      '**Close \\[scan\\]**',
      'Workspace: Research \\*desk\\*',
      'From: resume\\-calm\\-river\\-12ab',
      '',
      'Three findings.',
      '',
      'https://openalice.example/inbox',
    ].join('\n'))
  })

  it('replays deterministically into Telegram plain text', () => {
    expect(formatPlainInboxNotification(notification)).toBe([
      'Close [scan]',
      'Workspace: Research *desk*',
      'From: resume-calm-river-12ab',
      '',
      'Three findings.',
      '',
      'https://openalice.example/inbox',
    ].join('\n'))
  })
})

describe('connector linking health', () => {
  it('keeps an online unlinked bot distinct from healthy delivery', () => {
    const tracker = new AdapterHealthTracker('telegram')
    tracker.awaitingLink()

    expect(tracker.get()).toMatchObject({
      id: 'telegram',
      enabled: true,
      status: 'awaiting_link',
      detail: 'Bot is online and waiting for the owner to run /link.',
    })

    tracker.healthy('owner-1')
    expect(tracker.get()).toMatchObject({ status: 'healthy', owner: 'owner-1' })
    expect(tracker.get().detail).toBeUndefined()
  })
})
