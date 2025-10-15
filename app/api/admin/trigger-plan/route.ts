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
    const { adminUserId, teamId, forceRegenerate = false } = body;
    
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
    const planGenerator = createPlanGenerator(linearClient, {
      teamId: teamId || config.linear.teamId,
      includeCompletedTickets: config.planGeneration.includeCompletedTickets,
      includeCanceledTickets: config.planGeneration.includeCanceledTickets,
      maxTicketsPerUser: config.planGeneration.maxTicketsPerUser,
    });
    
    const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
    
    const session = await scheduler.triggerManualExecution(adminUserId, teamId);
    
    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        plansCount: session.plans.length,
        generatedAt: session.generatedAt,
        messageIds: session.messageIds,
      },
    });
  } catch (error) {
    console.error('Failed to trigger plan execution:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}