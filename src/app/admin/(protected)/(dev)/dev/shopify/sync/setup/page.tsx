import { Suspense } from 'react';
import { CheckCircle, XCircle, Database, ShoppingBag, Server, ExternalLink } from 'lucide-react';

export const dynamic = 'force-dynamic';

// ============================================================================
// Data Fetching
// ============================================================================

async function getConfigData() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/admin/shopify/sync/config`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error('Failed to fetch config:', error);
    return null;
  }
}

// ============================================================================
// Components
// ============================================================================

function ConfigCard({
  title,
  icon,
  configured,
  details,
  envVar,
}: {
  title: string;
  icon: React.ReactNode;
  configured: boolean;
  details?: React.ReactNode;
  envVar: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-muted">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            {configured ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {configured ? 'Configured via environment variable' : 'Not configured'}
          </p>
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded mt-2 inline-block">
            {envVar}
          </code>
          {details && <div className="mt-3">{details}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

async function SetupContent() {
  const config = await getConfigData();

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Configuration is managed via environment variables. To update settings, modify your{' '}
          <code className="bg-muted px-1 py-0.5 rounded text-xs">.env.local</code> file and restart
          the application.
        </p>
      </div>

      <div className="space-y-4">
        <ConfigCard
          title="Database Connection"
          icon={<Database className="h-5 w-5" />}
          configured={config?.database?.configured ?? false}
          envVar="DATABASE_URL"
          details={
            config?.database?.configured && (
              <div className="text-sm">
                <p className="text-muted-foreground">
                  Type: <span className="text-foreground">{config.database.type}</span>
                </p>
                <p className="text-muted-foreground font-mono text-xs mt-1">
                  {config.database.connectionString}
                </p>
              </div>
            )
          }
        />

        <ConfigCard
          title="Shopify Connection"
          icon={<ShoppingBag className="h-5 w-5" />}
          configured={config?.shopify?.configured ?? false}
          envVar="SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN"
          details={
            config?.shopify?.configured && (
              <div className="text-sm">
                <p className="text-muted-foreground">
                  Store: <span className="text-foreground">{config.shopify.storeDomain}</span>
                </p>
                <p className="text-muted-foreground">
                  API Version: <span className="text-foreground">{config.shopify.apiVersion}</span>
                </p>
                <p className="text-muted-foreground">
                  Token: <span className="font-mono text-xs">{config.shopify.accessToken}</span>
                </p>
              </div>
            )
          }
        />

        <ConfigCard
          title="Redis (Optional)"
          icon={<Server className="h-5 w-5" />}
          configured={config?.redis?.configured ?? false}
          envVar="REDIS_URL"
          details={
            <div className="text-sm text-muted-foreground">
              {config?.redis?.configured ? (
                <p className="font-mono text-xs">{config.redis.url}</p>
              ) : (
                <p>
                  Redis is optional. Without it, scheduled syncs and webhook queuing are unavailable,
                  but manual syncs still work.
                </p>
              )}
            </div>
          }
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-semibold mb-3">Environment Variables Reference</h3>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-4 py-2 border-b border-border">
            <div className="font-medium">Variable</div>
            <div className="font-medium">Required</div>
            <div className="font-medium">Description</div>
          </div>
          <div className="grid grid-cols-3 gap-4 py-2">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">DATABASE_URL</code>
            <span className="text-green-600">Yes</span>
            <span className="text-muted-foreground">SQL Server connection string</span>
          </div>
          <div className="grid grid-cols-3 gap-4 py-2">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SHOPIFY_STORE_DOMAIN</code>
            <span className="text-green-600">Yes</span>
            <span className="text-muted-foreground">e.g., your-store.myshopify.com</span>
          </div>
          <div className="grid grid-cols-3 gap-4 py-2">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SHOPIFY_ACCESS_TOKEN</code>
            <span className="text-green-600">Yes</span>
            <span className="text-muted-foreground">Admin API access token</span>
          </div>
          <div className="grid grid-cols-3 gap-4 py-2">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SHOPIFY_API_VERSION</code>
            <span className="text-muted-foreground">No</span>
            <span className="text-muted-foreground">Default: 2024-01</span>
          </div>
          <div className="grid grid-cols-3 gap-4 py-2">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SHOPIFY_WEBHOOK_SECRET</code>
            <span className="text-muted-foreground">No</span>
            <span className="text-muted-foreground">For webhook HMAC verification</span>
          </div>
          <div className="grid grid-cols-3 gap-4 py-2">
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">REDIS_URL</code>
            <span className="text-muted-foreground">No</span>
            <span className="text-muted-foreground">For scheduling and webhook queuing</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="font-semibold mb-3">Webhook Configuration</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Configure webhooks in your Shopify admin to enable real-time sync updates.
        </p>
        <div className="bg-muted p-3 rounded-lg">
          <p className="text-xs font-medium text-muted-foreground mb-1">Webhook URL</p>
          <code className="text-sm">
            {process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com'}/api/webhooks/shopify-sync
          </code>
        </div>
        <a
          href="https://help.shopify.com/en/manual/orders/notifications/webhooks"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3"
        >
          Shopify Webhook Documentation
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Setup</h1>
        <p className="text-muted-foreground mt-1">
          Configuration status and environment variable reference
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading configuration...
          </div>
        }
      >
        <SetupContent />
      </Suspense>
    </main>
  );
}
