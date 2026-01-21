/**
 * Schedules API Routes
 * GET /api/admin/shopify/sync/schedules - List all schedules
 * POST /api/admin/shopify/sync/schedules - Create a new schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSchedulerService,
  getMappingService,
  getSyncHistoryService,
  isRedisConfigured,
} from '@/lib/sync-service';

const CreateScheduleSchema = z.object({
  mappingId: z.string().uuid(),
  type: z.enum(['full', 'incremental']),
  pattern: z.string(),
  timezone: z.string().default('UTC'),
  enabled: z.boolean().default(true),
  options: z
    .object({
      lookbackMinutes: z.number().optional(),
      deleteStale: z.boolean().optional(),
    })
    .optional(),
});

export async function GET() {
  try {
    const redisAvailable = await isRedisConfigured();
    if (!redisAvailable) {
      return NextResponse.json({
        success: false,
        schedules: [],
        error: {
          code: 'REDIS_NOT_CONFIGURED',
          message: 'Scheduling requires Redis. Set REDIS_URL to enable.',
        },
      });
    }

    const schedulerService = getSchedulerService();
    const mappingService = getMappingService();
    const historyService = getSyncHistoryService();

    // Initialize scheduler if needed
    await schedulerService.initialize();

    // Build mapping lookup with last status
    const mappings = await mappingService.getAll();
    const mappingLookup = new Map<
      string,
      {
        name: string;
        lastStatus?: { status: string; duration?: number; recordCount?: number };
      }
    >();

    for (const mapping of mappings) {
      const lastRun = await historyService.getLastForMapping(mapping.id);
      mappingLookup.set(mapping.id, {
        name: mapping.name,
        lastStatus: lastRun
          ? {
              status: lastRun.status,
              duration: lastRun.duration?.totalMs,
              recordCount: lastRun.stats.inserted + lastRun.stats.updated,
            }
          : undefined,
      });
    }

    const schedules = await schedulerService.listSchedules(mappingLookup);

    return NextResponse.json({
      success: true,
      schedules,
    });
  } catch (error) {
    console.error('[Schedules] Error listing schedules:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list schedules' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const redisAvailable = await isRedisConfigured();
    if (!redisAvailable) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'REDIS_NOT_CONFIGURED',
            message: 'Scheduling requires Redis. Set REDIS_URL to enable.',
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = CreateScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const schedulerService = getSchedulerService();
    await schedulerService.initialize();

    const result = await schedulerService.upsertSchedule({
      mappingId: parsed.data.mappingId,
      type: parsed.data.type,
      pattern: parsed.data.pattern,
      timezone: parsed.data.timezone,
      enabled: parsed.data.enabled,
      options: parsed.data.options,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: { code: 'SCHEDULE_ERROR', message: result.message } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('[Schedules] Error creating schedule:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create schedule',
        },
      },
      { status: 500 }
    );
  }
}
