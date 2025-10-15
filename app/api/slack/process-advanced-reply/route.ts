import { NextRequest, NextResponse } from 'next/server';
import { createAdvancedSlackInteractionProcessor } from '../../../lib/services/advanced-slack-interaction-processor.js';
import { createLinearClient } from '../../../lib/mcp/linear-client.js';
import { logger } from '../../../lib/monitoring/logger.js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      message, 
      userId, 
      channelId, 
      messageTs, 
      planId, 
      teamId,
      previousMessages = []
    } = body;

    // Validate required fields
    if (!message || !userId || !channelId || !planId || !teamId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    logger.info('Processing advanced reply', {
      userId,
      channelId,
      planId,
      teamId,
      messageLength: message.length
    });

    // Create Linear client to fetch current data
    const linearClient = createLinearClient();
    
    // Fetch available tickets and users for the team
    const availableTickets = await linearClient.getTicketsByTeam(teamId);
    const availableUsers = await linearClient.getTeamMembers(teamId);

    // Create interaction processor
    const processor = createAdvancedSlackInteractionProcessor();

    // Create context for processing
    const context = {
      userId,
      channelId,
      messageTs,
      planId,
      teamId,
      availableTickets,
      availableUsers,
      previousMessages: previousMessages.map((msg: any) => ({
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        userId: msg.userId
      })),
      userPermissions: {
        allowedUsers: availableUsers.map(u => u.email),
        canReassign: true,
        canChangeStatus: true,
        canAddComments: true
      }
    };

    // Process the user's reply
    const result = await processor.processUserReply(message, context);

    if (result.success) {
      logger.info('Successfully processed advanced reply', {
        userId,
        planId,
        modificationsCount: result.modifications?.length || 0
      });

      return NextResponse.json({
        success: true,
        message: result.message,
        modifications: result.modifications,
        warnings: result.warnings
      });
    } else {
      logger.warn('Failed to process advanced reply', {
        userId,
        planId,
        errors: result.errors
      });

      return NextResponse.json({
        success: false,
        message: result.message,
        errors: result.errors,
        warnings: result.warnings
      });
    }

  } catch (error) {
    logger.error('Error in advanced reply processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing your request'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const planId = searchParams.get('planId');

  if (!userId || !planId) {
    return NextResponse.json(
      { error: 'Missing userId or planId' },
      { status: 400 }
    );
  }

  try {
    const processor = createAdvancedSlackInteractionProcessor();
    
    // This would typically fetch user behavior data from a database
    // For now, return a placeholder response
    const behaviorAnalysis = await processor.analyzeUserBehavior(userId, []);

    return NextResponse.json({
      success: true,
      analysis: behaviorAnalysis
    });

  } catch (error) {
    logger.error('Error analyzing user behavior', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      { error: 'Failed to analyze user behavior' },
      { status: 500 }
    );
  }
}