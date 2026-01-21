/**
 * Webhook Types - Webhook processing interfaces
 */

// ============================================================================
// Webhook Job Types (for BullMQ queue)
// ============================================================================

export interface WebhookJob {
  id: string;                          // Shopify webhook ID (X-Shopify-Webhook-Id)
  topic: string;                       // e.g., 'products/update'
  shopDomain: string;                  // e.g., 'mystore.myshopify.com'
  payload: Record<string, unknown>;    // Webhook payload
  receivedAt: string;                  // ISO timestamp when received
}

export interface WebhookProcessResult {
  webhookId: string;
  topic: string;
  success: boolean;
  mappingsProcessed: string[];         // IDs of mappings that processed this webhook
  recordsWritten: number;
  errors: string[];
  processingMs: number;
}

// ============================================================================
// Webhook Event Types
// ============================================================================

export interface ShopifyWebhookPayload {
  id: string | number;
  admin_graphql_api_id?: string;
  [key: string]: unknown;
}

export interface WebhookEvent {
  id: string;
  topic: string;           // e.g., 'products/update', 'orders/create'
  shopDomain: string;
  payload: ShopifyWebhookPayload;
  receivedAt: Date;
  hmacHeader?: string;
}

// ============================================================================
// Webhook Processing Types
// ============================================================================

export type WebhookStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface WebhookProcessingResult {
  webhookId: string;
  success: boolean;
  status: WebhookStatus;
  mappingsProcessed: number;
  recordsWritten: number;
  processingMs: number;
  error?: string;
}

export interface WebhookHistoryEntry {
  id: string;
  webhookId: string;              // Shopify webhook ID
  topic: string;
  shopDomain: string;
  receivedAt: string;             // ISO timestamp
  processedAt?: string;           // ISO timestamp
  status: WebhookStatus;
  mappingsProcessed: string[];    // Array of mapping IDs that processed this webhook
  recordsWritten: number;
  processingMs: number;
  error?: string;
}

// ============================================================================
// Webhook Stats Types
// ============================================================================

export interface WebhookDayStats {
  received: number;
  processed: number;
  failed: number;
  skipped: number;
  avgProcessingMs: number;
}

export interface WebhookQueueStats {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export interface WebhookStats {
  today: WebhookDayStats;
  byTopic: Record<string, {
    received: number;
    processed: number;
    failed: number;
  }>;
  queue: WebhookQueueStats;
}

// ============================================================================
// Webhook Registration Types
// ============================================================================

export interface WebhookRegistration {
  id: string;
  topic: string;
  address: string;
  format: 'json' | 'xml';
  createdAt: string;
}

export interface RegisterWebhookResult {
  success: boolean;
  registration?: WebhookRegistration;
  error?: string;
}
