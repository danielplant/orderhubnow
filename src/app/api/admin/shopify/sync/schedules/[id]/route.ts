/**
 * Single Schedule API Routes
 * GET /api/admin/shopify/sync/schedules/[id] - Get schedule by mapping ID
 * PUT /api/admin/shopify/sync/schedules/[id] - Update schedule
 * DELETE /api/admin/shopify/sync/schedules/[id] - Delete schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getSchedulerService,
  getMappingService,
  getSyncHistoryService,
  isRedisConfigured,
} from '@/lib/sync-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UpdateScheduleSchema = z.object({
  type: z.enum(['full', 'incremental']).optional(),
  pattern: z.string().optional(),
  timezone: z.string().optional(),
  enabled: z.boolean().optional(),
  options: z
    .object({
      lookbackMinutes: z.number().optional(),
      deleteStale: z.boolean().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const redisAvailable = await isRedisConfigured();
    if (!redisAvailable) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'REDIS_NOT_CONFIGURED',
          message: 'Scheduling requires Redis. Set REDIS_URL to enable.',
        },
      });
    }

    const { id: mappingId } = await params;
    const schedulerService = getSchedulerService();
    const mappingService = getMappingService();
    const historyService = getSyncHistoryService();

    await schedulerService.initialize();

    // Get mapping info
    const mapping = await mappingService.getById(mappingId);
    if (!mapping) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Mapping not found' } },
        { status: 404 }
      );
    }

    // Get last run status
    const lastRun = await historyService.getLastForMapping(mappingId);
    const lastStatus = lastRun
      ? {
          status: lastRun.status,
          duration: lastRun.duration?.totalMs,
          recordCount: lastRun.stats.inserted + lastRun.stats.updated,
        }
      : undefined;

    const schedule = await schedulerService.getSchedule(mappingId, mapping.name, lastStatus);

    if (!schedule) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      schedule,
    });
  } catch (error) {
    console.error('[Schedules] Error getting schedule:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get schedule' } },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    const { id: mappingId } = await params;
    const body = await request.json();
    const parsed = UpdateScheduleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
        { status: 400 }
      );
    }

    const schedulerService = getSchedulerService();
    await schedulerService.initialize();

    // Build the full schedule config (need required fields)
    const updateData = parsed.data;

    // Require type and pattern for updates
    if (!updateData.type || !updateData.pattern) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'type and pattern are required for updates' },
        },
        { status: 400 }
      );
    }

    const result = await schedulerService.upsertSchedule({
      mappingId,
      type: updateData.type,
      pattern: updateData.pattern,
      timezone: updateData.timezone,
      enabled: updateData.enabled ?? true,
      options: updateData.options,
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
    console.error('[Schedules] Error updating schedule:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update schedule',
        },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const { id: mappingId } = await params;
    const schedulerService = getSchedulerService();
    await schedulerService.initialize();

    const deleted = await schedulerService.removeSchedule(mappingId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Schedule not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Schedule deleted',
    });
  } catch (error) {
    console.error('[Schedules] Error deleting schedule:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete schedule' } },
      { status: 500 }
    );
  }
}
