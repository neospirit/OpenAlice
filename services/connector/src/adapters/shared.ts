import type { ConnectorAdapterHealth, InboxNotification } from '@traderalice/connector-protocol'

export class AdapterHealthTracker {
  private value: ConnectorAdapterHealth

  constructor(id: string) {
    this.value = { id, enabled: true, status: 'starting' }
  }

  healthy(owner?: string): void {
    this.value = { ...this.value, status: 'healthy', detail: undefined, lastError: undefined, owner }
  }

  awaitingLink(): void {
    this.value = {
      ...this.value,
      status: 'awaiting_link',
      detail: 'Bot is online and waiting for the owner to run /link.',
      lastError: undefined,
      owner: undefined,
    }
  }

  degraded(error: unknown): void {
    this.value = {
      ...this.value,
      status: 'degraded',
      detail: 'External connector is unavailable.',
      lastError: error instanceof Error ? error.message : String(error),
    }
  }

  attempt(): void {
    this.value = { ...this.value, lastAttemptAt: new Date().toISOString() }
  }

  success(owner?: string): void {
    const now = new Date().toISOString()
    this.value = {
      ...this.value,
      status: 'healthy',
      detail: undefined,
      lastError: undefined,
      lastAttemptAt: this.value.lastAttemptAt ?? now,
      lastSuccessAt: now,
      owner: owner ?? this.value.owner,
    }
  }

  stopped(): void {
    this.value = { ...this.value, status: 'stopped' }
  }

  get(): ConnectorAdapterHealth {
    return { ...this.value }
  }
}

export function formatInboxNotification(notification: InboxNotification): string {
  const workspace = notification.workspaceLabel ?? notification.workspaceId
  const provenance = notification.provenance?.actorLabel ?? notification.provenance?.resumeId
  const parts = [
    `**${escapeMarkdown(notification.title)}**`,
    `Workspace: ${escapeMarkdown(workspace)}`,
  ]
  if (provenance) parts.push(`From: ${escapeMarkdown(provenance)}`)
  if (notification.body.trim()) parts.push('', truncate(notification.body.trim(), 1_600))
  if (notification.href) parts.push('', notification.href)
  return parts.join('\n')
}

export function formatPlainInboxNotification(notification: InboxNotification): string {
  const workspace = notification.workspaceLabel ?? notification.workspaceId
  const provenance = notification.provenance?.actorLabel ?? notification.provenance?.resumeId
  const parts = [notification.title, `Workspace: ${workspace}`]
  if (provenance) parts.push(`From: ${provenance}`)
  if (notification.body.trim()) parts.push('', truncate(notification.body.trim(), 1_600))
  if (notification.href) parts.push('', notification.href)
  return parts.join('\n')
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1')
}
