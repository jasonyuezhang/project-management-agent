import { NextRequest, NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';
import { createPlanGenerator } from '@/lib/plan-generator';
import { createPlanScheduler } from '@/lib/scheduler';
import { createConfigManager } from '@/lib/config/agent-config';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { 
      cronExpression, 
      timezone, 
      enabled, 
      adminUserId,
      teamId,
      summaryChannelId,
      summaryUserGroupId 
    } = body;
    
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
    
    // Validate cron expression
    const cronParts = cronExpression.split(' ');
    if (cronParts.length !== 5) {
      return NextResponse.json({
        success: false,
        error: 'Invalid cron expression. Expected format: "minute hour day month weekday"',
      }, { status: 400 });
    }
    
    const linearClient = createLinearMCPClient();
    const slackClient = createSlackMCPClient();
    const planGenerator = createPlanGenerator(linearClient, {
      teamId: teamId || config.linear.teamId,
      includeCompletedTickets: config.planGeneration.includeCompletedTickets,
      includeCanceledTickets: config.planGeneration.includeCanceledTickets,
      maxTicketsPerUser: config.planGeneration.maxTicketsPerUser,
    });
    
    const scheduler = createPlanScheduler(linearClient, slackClient, planGenerator);
    
    const scheduleConfig = {
      cronExpression,
      timezone: timezone || config.scheduling.timezone,
      enabled: enabled !== false,
      adminUserId,
      teamId: teamId || config.linear.teamId,
      summaryChannelId: summaryChannelId || config.slack.channels.summary,
      summaryUserGroupId: summaryUserGroupId || config.slack.userGroups.summary,
    };
    
    await scheduler.scheduleExecution(scheduleConfig);
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Schedule updated successfully',
        config: scheduleConfig,
      },
    });
  } catch (error) {
    console.error('Failed to update schedule:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { adminUserId } = body;
    
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
    const scheduler = createPlanScheduler(linearClient, slackClient, planGenerator);
    
    await scheduler.cancelScheduledExecution();
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Schedule cancelled successfully',
      },
    });
  } catch (error) {
    console.error('Failed to cancel schedule:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}