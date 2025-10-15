import { NextRequest, NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';
import { createPlanGenerator } from '@/lib/plan-generator';
import { createEnhancedPlanScheduler } from '@/lib/enhanced-scheduler';
import { createConfigManager } from '@/lib/config/agent-config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    
    const configManager = createConfigManager();
    const config = configManager.getConfig();
    
    const linearClient = createLinearMCPClient();
    const slackClient = createSlackMCPClient();
    const planGenerator = createPlanGenerator(linearClient, {
      teamId: config.linear.teamId,
      includeCompletedTickets: config.planGeneration.includeCompletedTickets,
      includeCanceledTickets: config.planGeneration.includeCanceledTickets,
      maxTicketsPerUser: config.planGeneration.maxTicketsPerUser,
    });
    
    const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
    
    if (sessionId) {
      // Get specific session
      const session = await scheduler.getSession(sessionId);
      
      if (!session) {
        return NextResponse.json({
          success: false,
          error: 'Session not found',
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        data: {
          session,
        },
      });
    } else {
      // Get all active sessions and statistics
      const activeSessions = await scheduler.getActiveSessions();
      const stats = scheduler.getExecutionStats();
      
      // Get last execution time
      const lastExecution = activeSessions.length > 0 
        ? new Date(Math.max(...activeSessions.map(s => s.generatedAt.getTime())))
        : null;
      
      // Get next scheduled execution (simplified - in production you'd track this)
      const nextScheduled = config.features.enableScheduledExecution 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000) // Placeholder: next 24 hours
        : null;
      
      return NextResponse.json({
        success: true,
        data: {
          activeSessions: activeSessions.slice(0, 10), // Limit to last 10 sessions
          lastExecution: lastExecution?.toISOString(),
          nextScheduled: nextScheduled?.toISOString(),
          statistics: stats,
          configuration: {
            features: config.features,
            scheduling: config.scheduling,
            planGeneration: config.planGeneration,
          },
        },
      });
    }
  } catch (error) {
    console.error('Failed to get execution plan status:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { sessionId, status, errorMessage } = body;
    
    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: 'Session ID is required',
      }, { status: 400 });
    }
    
    const validStatuses = ['pending', 'confirmed', 'completed', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      }, { status: 400 });
    }
    
    const configManager = createConfigManager();
    const config = configManager.getConfig();
    
    const linearClient = createLinearMCPClient();
    const slackClient = createSlackMCPClient();
    const planGenerator = createPlanGenerator(linearClient, {
      teamId: config.linear.teamId,
      includeCompletedTickets: config.planGeneration.includeCompletedTickets,
      includeCanceledTickets: config.planGeneration.includeCanceledTickets,
      maxTicketsPerUser: config.planGeneration.maxTicketsPerUser,
    });
    
    const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
    
    if (status) {
      await scheduler.updateSessionStatus(sessionId, status, errorMessage);
    }
    
    const session = await scheduler.getSession(sessionId);
    
    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Session not found',
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: {
        session,
        message: status ? `Session status updated to ${status}` : 'Session retrieved successfully',
      },
    });
  } catch (error) {
    console.error('Failed to update session status:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}