import { z } from 'zod'

export const connectorFieldKindSchema = z.enum(['text', 'secret', 'number', 'boolean'])
export type ConnectorFieldKind = z.infer<typeof connectorFieldKindSchema>

export const connectorFieldDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  kind: connectorFieldKindSchema,
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  /** Slash command that owns this value. Settings renders these fields as
   *  lifecycle output rather than ordinary operator-entered configuration. */
  learnedBy: z.string().min(1).optional(),
})
export type ConnectorFieldDefinition = z.infer<typeof connectorFieldDefinitionSchema>

export const connectorDefinitionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  fields: z.array(connectorFieldDefinitionSchema),
  commands: z.array(z.object({
    name: z.string().min(1),
    description: z.string().min(1),
  })).default([]),
})
export type ConnectorDefinition = z.infer<typeof connectorDefinitionSchema>

export const connectorAdapterConfigSchema = z.object({
  enabled: z.boolean().default(false),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
})
export type ConnectorAdapterConfig = z.infer<typeof connectorAdapterConfigSchema>

export const connectorConfigSchema = z.object({
  version: z.literal(1).default(1),
  adapters: z.record(z.string(), connectorAdapterConfigSchema).default({}),
})
export type ConnectorConfig = z.infer<typeof connectorConfigSchema>

export const publicConnectorAdapterConfigSchema = z.object({
  enabled: z.boolean(),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  configuredSecrets: z.array(z.string()),
})
export type PublicConnectorAdapterConfig = z.infer<typeof publicConnectorAdapterConfigSchema>

export const publicConnectorConfigSchema = z.object({
  serviceEnabled: z.boolean(),
  adapters: z.record(z.string(), publicConnectorAdapterConfigSchema),
})
export type PublicConnectorConfig = z.infer<typeof publicConnectorConfigSchema>

export const inboxNotificationSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  workspaceId: z.string().min(1),
  workspaceLabel: z.string().optional(),
  title: z.string().min(1),
  body: z.string().default(''),
  href: z.string().optional(),
  provenance: z.object({
    resumeId: z.string().optional(),
    actorLabel: z.string().optional(),
  }).optional(),
})
export type InboxNotification = z.infer<typeof inboxNotificationSchema>

export const connectorAdapterHealthSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  status: z.enum(['disabled', 'starting', 'awaiting_link', 'healthy', 'degraded', 'stopped']),
  detail: z.string().optional(),
  owner: z.string().optional(),
  lastAttemptAt: z.string().datetime().optional(),
  lastSuccessAt: z.string().datetime().optional(),
  lastError: z.string().optional(),
})
export type ConnectorAdapterHealth = z.infer<typeof connectorAdapterHealthSchema>

export const connectorServiceHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  startedAt: z.string().datetime(),
  adapters: z.array(connectorAdapterHealthSchema),
})
export type ConnectorServiceHealth = z.infer<typeof connectorServiceHealthSchema>

export const connectorDeliveryReceiptSchema = z.object({
  accepted: z.literal(true),
  deliveryId: z.string().min(1),
})
export type ConnectorDeliveryReceipt = z.infer<typeof connectorDeliveryReceiptSchema>
