/**
 * Alias Signals API
 * ============================================================================
 * Logs multi-select filter patterns to learn entity aliases.
 * Path: src/app/api/alias-signals/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth/providers';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const body = await request.json();
    
    const { entityType, values, reportType, sessionId } = body;
    
    // Validate required fields
    if (!entityType || !values || !Array.isArray(values)) {
      return NextResponse.json(
        { error: 'Missing required fields: entityType and values[]' },
        { status: 400 }
      );
    }
    
    // Only log if 2+ values selected (indicates potential alias)
    if (values.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 values required to log an alias signal' },
        { status: 400 }
      );
    }
    
    // Check for duplicate signal in recent session (avoid spam)
    const recentDuplicate = await prisma.aliasSignals.findFirst({
      where: {
        EntityType: entityType,
        SelectedValues: JSON.stringify(values.sort()),
        SessionID: sessionId || undefined,
        CreatedAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
    });
    
    if (recentDuplicate) {
      return NextResponse.json({ 
        success: true, 
        id: recentDuplicate.ID,
        message: 'Duplicate signal already logged'
      });
    }
    
    // Create the alias signal
    const result = await prisma.aliasSignals.create({
      data: {
        EntityType: entityType,
        SelectedValues: JSON.stringify(values.sort()), // Sort for consistent matching
        ReportType: reportType || 'unknown',
        CreatedBy: session?.user?.id ? parseInt(session.user.id as string) : null,
        SessionID: sessionId || null,
      },
    });
    
    return NextResponse.json({ 
      success: true, 
      id: result.ID 
    });
  } catch (error) {
    console.error('Failed to log alias signal:', error);
    
    // If table doesn't exist yet, return success (graceful degradation)
    if (error instanceof Error && error.message.includes('AliasSignals')) {
      return NextResponse.json({ 
        success: false, 
        error: 'AliasSignals table not yet created - run migration' 
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to log alias signal' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const limit = parseInt(searchParams.get('limit') || '100');
    
    const signals = await prisma.aliasSignals.findMany({
      where: entityType ? { EntityType: entityType } : undefined,
      orderBy: { CreatedAt: 'desc' },
      take: limit,
    });
    
    // Parse JSON values
    const parsed = signals.map(s => ({
      id: s.ID,
      entityType: s.EntityType,
      values: JSON.parse(s.SelectedValues),
      reportType: s.ReportType,
      createdAt: s.CreatedAt,
    }));
    
    return NextResponse.json({ signals: parsed });
  } catch (error) {
    console.error('Failed to fetch alias signals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alias signals', signals: [] },
      { status: 500 }
    );
  }
}
