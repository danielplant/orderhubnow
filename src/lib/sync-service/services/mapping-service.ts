/**
 * Mapping Service - Prisma-based mapping configuration management
 *
 * This service manages SyncMapping records using Prisma instead of JSON files.
 */

import { prisma } from '@/lib/prisma';
import type {
  MappingConfig,
  FieldMapping,
  MappingFilter,
  DeleteStrategy,
} from '../types/mapping';

// ============================================================================
// Helper Types
// ============================================================================

interface KeyMappingJson {
  sourceField: string;
  targetColumn: string;
}

// ============================================================================
// Mapping Service
// ============================================================================

export class MappingService {
  /**
   * Get all mapping configurations.
   */
  async getAll(): Promise<MappingConfig[]> {
    const records = await prisma.syncMapping.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toMappingConfig(r));
  }

  /**
   * Get enabled mapping configurations only.
   */
  async getEnabled(): Promise<MappingConfig[]> {
    const records = await prisma.syncMapping.findMany({
      where: { enabled: true },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.toMappingConfig(r));
  }

  /**
   * Get a single mapping by ID.
   */
  async getById(id: string): Promise<MappingConfig | null> {
    const record = await prisma.syncMapping.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return this.toMappingConfig(record);
  }

  /**
   * Get mappings by source resource.
   */
  async getBySourceResource(sourceResource: string): Promise<MappingConfig[]> {
    const records = await prisma.syncMapping.findMany({
      where: {
        sourceResource,
        enabled: true,
      },
    });

    return records.map((r) => this.toMappingConfig(r));
  }

  /**
   * Get mappings that handle a specific webhook topic.
   */
  async getByWebhookTopic(topic: string): Promise<MappingConfig[]> {
    const records = await prisma.syncMapping.findMany({
      where: {
        enabled: true,
        webhookTopics: {
          contains: topic,
        },
      },
    });

    return records.map((r) => this.toMappingConfig(r));
  }

  /**
   * Create a new mapping configuration.
   */
  async create(
    config: Omit<MappingConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const record = await prisma.syncMapping.create({
      data: {
        name: config.name,
        description: config.description,
        sourceResource: config.sourceResource,
        targetTable: config.targetTable,
        keyMapping: config.keyMapping ? JSON.stringify(config.keyMapping) : null,
        mappingsJson: JSON.stringify(config.mappings),
        webhookTopics: this.encodeWebhookTopics(config),
        enabled: true,
      },
    });

    return record.id;
  }

  /**
   * Update an existing mapping configuration.
   */
  async update(
    id: string,
    config: Partial<Omit<MappingConfig, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<boolean> {
    try {
      await prisma.syncMapping.update({
        where: { id },
        data: {
          name: config.name,
          description: config.description,
          sourceResource: config.sourceResource,
          targetTable: config.targetTable,
          keyMapping: config.keyMapping !== undefined
            ? (config.keyMapping ? JSON.stringify(config.keyMapping) : null)
            : undefined,
          mappingsJson: config.mappings !== undefined
            ? JSON.stringify(config.mappings)
            : undefined,
          webhookTopics: config.webhookEnabled !== undefined || config.deleteStrategy !== undefined
            ? this.encodeWebhookTopics(config as MappingConfig)
            : undefined,
          enabled: config.webhookEnabled, // Map webhookEnabled to enabled
        },
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a mapping configuration.
   */
  async delete(id: string): Promise<boolean> {
    try {
      await prisma.syncMapping.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Toggle enabled status for a mapping.
   */
  async setEnabled(id: string, enabled: boolean): Promise<boolean> {
    try {
      await prisma.syncMapping.update({
        where: { id },
        data: { enabled },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique ID for a new field mapping.
   */
  generateFieldMappingId(): string {
    return crypto.randomUUID();
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Convert a Prisma record to MappingConfig.
   */
  private toMappingConfig(record: {
    id: string;
    name: string;
    description: string | null;
    sourceResource: string;
    targetTable: string;
    keyMapping: string | null;
    mappingsJson: string;
    webhookTopics: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): MappingConfig {
    // Parse keyMapping JSON
    let keyMapping: MappingConfig['keyMapping'];
    if (record.keyMapping) {
      try {
        const parsed = JSON.parse(record.keyMapping) as KeyMappingJson;
        keyMapping = {
          sourceField: parsed.sourceField,
          targetColumn: parsed.targetColumn,
        };
      } catch {
        // Invalid JSON, leave undefined
      }
    }

    // Parse mappings JSON
    let mappings: FieldMapping[] = [];
    try {
      mappings = JSON.parse(record.mappingsJson) as FieldMapping[];
    } catch {
      // Invalid JSON, use empty array
    }

    // Parse webhook config from webhookTopics field
    const webhookConfig = this.decodeWebhookTopics(record.webhookTopics);

    return {
      id: record.id,
      name: record.name,
      description: record.description ?? undefined,
      sourceResource: record.sourceResource,
      targetTable: record.targetTable,
      keyMapping,
      mappings,
      webhookEnabled: record.enabled,
      deleteStrategy: webhookConfig.deleteStrategy,
      softDeleteColumn: webhookConfig.softDeleteColumn,
      filters: webhookConfig.filters,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Encode webhook-related config into the webhookTopics field.
   * Format: "topic1,topic2|deleteStrategy|softDeleteColumn|filtersJson"
   */
  private encodeWebhookTopics(config: Partial<MappingConfig>): string | null {
    const parts: string[] = [];

    // Topics (derive from sourceResource if not specified)
    const topics = this.deriveWebhookTopics(config.sourceResource ?? '');
    parts.push(topics.join(','));

    // Delete strategy
    parts.push(config.deleteStrategy ?? 'hard');

    // Soft delete column
    parts.push(config.softDeleteColumn ?? '');

    // Filters as JSON
    parts.push(config.filters ? JSON.stringify(config.filters) : '');

    return parts.join('|');
  }

  /**
   * Decode webhook config from the webhookTopics field.
   */
  private decodeWebhookTopics(webhookTopics: string | null): {
    topics: string[];
    deleteStrategy?: DeleteStrategy;
    softDeleteColumn?: string;
    filters?: MappingFilter[];
  } {
    if (!webhookTopics) {
      return { topics: [] };
    }

    const parts = webhookTopics.split('|');

    return {
      topics: parts[0] ? parts[0].split(',').filter(Boolean) : [],
      deleteStrategy: (parts[1] as DeleteStrategy) || undefined,
      softDeleteColumn: parts[2] || undefined,
      filters: parts[3] ? JSON.parse(parts[3]) : undefined,
    };
  }

  /**
   * Derive webhook topics from source resource.
   */
  private deriveWebhookTopics(sourceResource: string): string[] {
    const resource = sourceResource.toLowerCase();

    switch (resource) {
      case 'product':
      case 'products':
        return ['products/create', 'products/update', 'products/delete'];
      case 'productvariant':
      case 'productvariants':
        return ['products/create', 'products/update', 'products/delete'];
      case 'collection':
      case 'collections':
        return ['collections/create', 'collections/update', 'collections/delete'];
      case 'order':
      case 'orders':
        return ['orders/create', 'orders/updated', 'orders/cancelled'];
      case 'customer':
      case 'customers':
        return ['customers/create', 'customers/update', 'customers/delete'];
      case 'inventorylevel':
      case 'inventorylevels':
        return ['inventory_levels/update'];
      default:
        return [];
    }
  }
}

// Singleton instance
let mappingServiceInstance: MappingService | null = null;

export function getMappingService(): MappingService {
  if (!mappingServiceInstance) {
    mappingServiceInstance = new MappingService();
  }
  return mappingServiceInstance;
}
