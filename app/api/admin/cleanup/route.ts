import { NextRequest, NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';
import { createPlanGenerator } from '@/lib/plan-generator';
import { createEnhancedPlanScheduler } from '@/lib/enhanced-scheduler';
import { createConfigManager } from '@/lib/config/agent-config';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { adminUserId, maxAgeHours = 24 } = body;
    
    if (!adminUserId) {
      return NextResponse.json({
        success: false,
        error: 'Admin user ID is required',
      }, { status: 400 });
    }
    
    const configManager = createConfigManager();
    const config = configManager.getConfig();
    
    // Validate admin user
    if (!config.scheduling.adminUserIds.includes(adminUserId)) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized: User is not an admin',
      }, { status: 403 });
    }
    
    // Validate maxAgeHours
    if (maxAgeHours < 1 || maxAgeHours > 168) { // 1 hour to 1 week
      return NextResponse.json({
        success: false,
        error: 'maxAgeHours must be between 1 and 168 (1 week)',
      }, { status: 400 });
    }
    
    const linearClient = createLinearMCPClient();
    const slackClient = createSlackMCPClient();
    const planGenerator = createPlanGenerator(linearClient);
    const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
    
    // Get stats before cleanup
    const statsBefore = scheduler.getExecutionStats();
    
    // Perform cleanup
    await scheduler.cleanupOldData(maxAgeHours);
    
    // Get stats after cleanup
    const statsAfter = scheduler.getExecutionStats();
    
    const cleanedSessions = statsBefore.totalSessions - statsAfter.totalSessions;
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Cleanup completed successfully',
        maxAgeHours,
        cleanedSessions,
        statsBefore,
        statsAfter,
      },
    });
  } catch (error) {
    console.error('Failed to perform cleanup:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const adminUserId = searchParams.get('adminUserId');
    
    if (!adminUserId) {
      return NextResponse.json({
        success: false,
        error: 'Admin user ID is required',
      }, { status: 400 });
    }
    
    const configManager = createConfigManager();
    const config = configManager.getConfig();
    
    // Validate admin user
    if (!config.scheduling.adminUserIds.includes(adminUserId)) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized: User is not an admin',
      }, { status: 403 });
    }
    
    const linearClient = createLinearMCPClient();
    const slackClient = createSlackMCPClient();
    const planGenerator = createPlanGenerator(linearClient);
    const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
    
    const stats = scheduler.getExecutionStats();
    const scheduleInfo = await scheduler.getScheduleInfo();
    
    return NextResponse.json({
      success: true,
      data: {
        statistics: stats,
        schedule: scheduleInfo,
        recommendations: {
          shouldCleanup: stats.totalSessions > 100,
          suggestedMaxAgeHours: 24,
          oldSessionsCount: stats.completedSessions + stats.failedSessions,
        },
      },
    });
  } catch (error) {
    console.error('Failed to get cleanup info:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}