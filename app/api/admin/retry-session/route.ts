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
    const { sessionId, adminUserId } = body;
    
    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: 'Session ID is required',
      }, { status: 400 });
    }
    
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
    
    // Get the session first to check if it exists and is retryable
    const session = await scheduler.getSession(sessionId);
    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Session not found',
      }, { status: 404 });
    }
    
    if (session.status !== 'failed') {
      return NextResponse.json({
        success: false,
        error: 'Session is not in failed status and cannot be retried',
      }, { status: 400 });
    }
    
    // Retry the session
    const retriedSession = await scheduler.retryFailedSession(sessionId);
    
    if (!retriedSession) {
      return NextResponse.json({
        success: false,
        error: 'Session retry failed or exceeded maximum retry attempts',
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Session retry initiated successfully',
        session: retriedSession,
      },
    });
  } catch (error) {
    console.error('Failed to retry session:', error);
    
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
    
    // Get all failed sessions that can be retried
    const activeSessions = await scheduler.getActiveSessions();
    const retryableSessions = activeSessions.filter(session => 
      session.status === 'failed' && 
      (session.retryCount || 0) < 3 // Max retries
    );
    
    return NextResponse.json({
      success: true,
      data: {
        retryableSessions: retryableSessions.map(session => ({
          id: session.id,
          generatedAt: session.generatedAt,
          status: session.status,
          errorMessage: session.errorMessage,
          retryCount: session.retryCount || 0,
          lastRetryAt: session.lastRetryAt,
          nextRetryAt: session.nextRetryAt,
        })),
        totalCount: retryableSessions.length,
      },
    });
  } catch (error) {
    console.error('Failed to get retryable sessions:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}