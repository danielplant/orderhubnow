/**
 * Next.js Instrumentation Hook
 *
 * This file runs once when the server starts and is used to initialize
 * global resources like job queues.
 *
 * Phase 3: Durable Background Jobs
 */

export async function register() {
  // Only run on server (Node.js runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Dynamic imports to avoid bundling issues
    const { initializeExportQueue } = await import(
      '@/lib/sync-service/services/export-queue'
    )
    const { initializeThumbnailQueue } = await import(
      '@/lib/sync-service/services/thumbnail-queue'
    )

    // Initialize queues in parallel (non-blocking)
    Promise.all([initializeExportQueue(), initializeThumbnailQueue()])
      .then(([exportReady, thumbReady]) => {
        console.log(
          `[Startup] Export queue: ${exportReady ? 'ready (Redis)' : 'sync mode'}`
        )
        console.log(
          `[Startup] Thumbnail queue: ${thumbReady ? 'ready (Redis)' : 'sync mode'}`
        )
      })
      .catch((err) => {
        // Don't crash the server if queue init fails - will fallback to sync mode
        console.error('[Startup] Queue initialization failed:', err)
      })
  }
}
