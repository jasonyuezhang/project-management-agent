import { NextRequest, NextResponse } from 'next/server';
import { createExecutionSessionIntegration, ExecutionSessionIntegrationConfig } from '../../../lib/services/execution-session-integration.js';

const config: ExecutionSessionIntegrationConfig = {
  sessionManagement: {
    databasePath: process.env.SESSION_DB_PATH || './data/sessions.db',
    autoCleanupDays: parseInt(process.env.SESSION_CLEANUP_DAYS || '30')
  },
  linear: {
    apiKey: process.env.LINEAR_API_KEY || '',
    teamId: process.env.LINEAR_TEAM_ID || ''
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN || '',
    appToken: process.env.SLACK_APP_TOKEN || '',
    signingSecret: process.env.SLACK_SIGNING_SECRET || ''
  }
};

export async function GET(request: NextRequest) {
  try {
    const integration = createExecutionSessionIntegration(config);
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const sessionId = searchParams.get('sessionId');

    switch (action) {
      case 'status':
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }
        const status = await integration.getSessionStatus(sessionId);
        return NextResponse.json(status);

      case 'active':
        const activeSessions = await integration.getActiveSessions();
        return NextResponse.json(activeSessions);

      case 'stats':
        const stats = await integration.getSessionStats();
        return NextResponse.json(stats);

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in sessions GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const integration = createExecutionSessionIntegration(config);
    const body = await request.json();
    const { action, sessionId, adminUserId, teamId, userId, ticketId, actionType, value, reason } = body;

    switch (action) {
      case 'create':
        if (!adminUserId || !teamId) {
          return NextResponse.json(
            { error: 'adminUserId and teamId are required' },
            { status: 400 }
          );
        }
        const createResult = await integration.createExecutionSession(adminUserId, teamId);
        return NextResponse.json(createResult);

      case 'modify':
        if (!sessionId || !userId || !ticketId || !actionType || !value) {
          return NextResponse.json(
            { error: 'sessionId, userId, ticketId, actionType, and value are required' },
            { status: 400 }
          );
        }
        const modifyResult = await integration.processUserModification(
          sessionId,
          userId,
          ticketId,
          actionType,
          value
        );
        return NextResponse.json(modifyResult);

      case 'confirm':
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }
        const confirmResult = await integration.confirmSession(sessionId);
        return NextResponse.json(confirmResult);

      case 'complete':
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }
        const completeResult = await integration.completeSession(sessionId);
        return NextResponse.json(completeResult);

      case 'cancel':
        if (!sessionId) {
          return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
        }
        const cancelResult = await integration.cancelSession(sessionId, reason);
        return NextResponse.json(cancelResult);

      case 'cleanup':
        const daysOld = parseInt(body.daysOld || '30');
        const cleanupResult = await integration.cleanupOldSessions(daysOld);
        return NextResponse.json(cleanupResult);

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in sessions POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}