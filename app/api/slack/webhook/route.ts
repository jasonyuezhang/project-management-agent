import { NextRequest, NextResponse } from 'next/server';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';
import { createReplyProcessor } from '@/lib/processors/reply-processor';
import { createAdvancedSlackInteractionProcessor } from '@/lib/services/advanced-slack-interaction-processor';
import { createConfirmationMessage, createErrorMessage, createHelpMessage } from '@/lib/templates/slack-templates';
import { createLinearClient } from '@/lib/mcp/linear-client';
import { logger } from '@/lib/monitoring/logger';
import { createHash, timingSafeEqual } from 'crypto';

// Verify Slack request signature
function verifySlackSignature(
  body: string,
  signature: string,
  timestamp: string,
  signingSecret: string
): boolean {
  const baseString = `v0:${timestamp}:${body}`;
  const expectedSignature = `v0=${createHash('sha256')
    .update(baseString)
    .digest('hex')}`;

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

// Parse Slack payload
function parseSlackPayload(body: string): any {
  const params = new URLSearchParams(body);
  const payload = params.get('payload');
  
  if (payload) {
    return JSON.parse(payload);
  }
  
  // Handle URL-encoded form data
  const data: any = {};
  for (const [key, value] of params.entries()) {
    data[key] = value;
  }
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-slack-signature') || '';
    const timestamp = request.headers.get('x-slack-request-timestamp') || '';
    
    // Verify request signature
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      console.error('SLACK_SIGNING_SECRET not configured');
      return NextResponse.json({
        success: false,
        message: 'Server configuration error'
      }, { status: 500 });
    }

    if (!verifySlackSignature(body, signature, timestamp, signingSecret)) {
      console.error('Invalid Slack signature');
      return NextResponse.json({
        success: false,
        message: 'Unauthorized'
      }, { status: 401 });
    }

    const payload = parseSlackPayload(body);
    
    // Handle URL verification challenge
    if (payload.type === 'url_verification') {
      return NextResponse.json({
        challenge: payload.challenge
      });
    }

    // Handle interactive button clicks
    if (payload.type === 'block_actions') {
      return await handleBlockActions(payload);
    }

    // Handle message events (replies)
    if (payload.type === 'event_callback') {
      return await handleMessageEvent(payload);
    }

    return NextResponse.json({
      success: true,
      message: 'Event processed'
    });
  } catch (error) {
    console.error('Slack webhook error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}

async function handleBlockActions(payload: any): Promise<NextResponse> {
  try {
    const actions = payload.actions || [];
    const channel = payload.channel?.id;
    const user = payload.user?.id;
    const threadTs = payload.message?.thread_ts;

    if (!channel || !user) {
      return NextResponse.json({
        success: false,
        message: 'Missing channel or user information'
      }, { status: 400 });
    }

    const slackClient = createSlackMCPClient();
    await slackClient.connect();

    for (const action of actions) {
      switch (action.action_id) {
        case 'confirm_plan':
          await handlePlanConfirmation(slackClient, channel, user, action.value, threadTs);
          break;
          
        case 'request_changes':
          await handleRequestChanges(slackClient, channel, user, action.value, threadTs);
          break;
          
        case 'view_individual_plans':
          await handleViewIndividualPlans(slackClient, channel, user, action.value);
          break;
          
        case 'refresh_summary':
          await handleRefreshSummary(slackClient, channel, user, action.value);
          break;
          
        default:
          console.log('Unknown action:', action.action_id);
      }
    }

    await slackClient.disconnect();

    return NextResponse.json({
      success: true,
      message: 'Actions processed'
    });
  } catch (error) {
    console.error('Error handling block actions:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to process actions'
    }, { status: 500 });
  }
}

async function handleMessageEvent(payload: any): Promise<NextResponse> {
  try {
    const event = payload.event;
    
    // Only process message events
    if (event.type !== 'message' || event.bot_id) {
      return NextResponse.json({
        success: true,
        message: 'Event ignored'
      });
    }

    const channel = event.channel;
    const user = event.user;
    const text = event.text;
    const threadTs = event.thread_ts;

    if (!channel || !user || !text) {
      return NextResponse.json({
        success: false,
        message: 'Missing required event data'
      }, { status: 400 });
    }

    logger.info('Processing message event', {
      channel,
      user,
      textLength: text.length,
      threadTs
    });

    // Use advanced processing for better user experience
    await handleAdvancedUserReply(channel, user, text, threadTs);

    return NextResponse.json({
      success: true,
      message: 'Message processed'
    });
  } catch (error) {
    logger.error('Error handling message event:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to process message'
    }, { status: 500 });
  }
}

async function handlePlanConfirmation(
  slackClient: any,
  channel: string,
  user: string,
  planId: string,
  threadTs?: string
): Promise<void> {
  try {
    const message = createConfirmationMessage(planId, channel, threadTs);
    await slackClient.sendExecutionPlanMessage(message);
    
    // TODO: Update plan status in database
    console.log(`Plan ${planId} confirmed by user ${user}`);
  } catch (error) {
    console.error('Error confirming plan:', error);
    const errorMessage = createErrorMessage(
      'Failed to confirm plan. Please try again.',
      channel,
      threadTs
    );
    await slackClient.sendExecutionPlanMessage(errorMessage);
  }
}

async function handleRequestChanges(
  slackClient: any,
  channel: string,
  user: string,
  planId: string,
  threadTs?: string
): Promise<void> {
  try {
    const helpMessage = createHelpMessage(channel, threadTs);
    await slackClient.sendExecutionPlanMessage(helpMessage);
  } catch (error) {
    console.error('Error handling request changes:', error);
  }
}

async function handleViewIndividualPlans(
  slackClient: any,
  channel: string,
  user: string,
  teamId: string
): Promise<void> {
  try {
    // TODO: Fetch and display individual plans for the team
    console.log(`User ${user} requested individual plans for team ${teamId}`);
  } catch (error) {
    console.error('Error handling view individual plans:', error);
  }
}

async function handleRefreshSummary(
  slackClient: any,
  channel: string,
  user: string,
  teamId: string
): Promise<void> {
  try {
    // TODO: Refresh team summary
    console.log(`User ${user} requested refresh for team ${teamId}`);
  } catch (error) {
    console.error('Error handling refresh summary:', error);
  }
}

async function handleUserReply(
  slackClient: any,
  replyProcessor: any,
  channel: string,
  user: string,
  text: string,
  threadTs?: string
): Promise<void> {
  try {
    const modifications = await replyProcessor.parseUserReply(text, user);
    
    if (modifications.length === 0) {
      const helpMessage = createHelpMessage(channel, threadTs);
      await slackClient.sendExecutionPlanMessage(helpMessage);
      return;
    }

    // TODO: Validate modifications against available tickets and users
    // TODO: Apply modifications to Linear
    // TODO: Send confirmation message

    console.log(`User ${user} submitted ${modifications.length} modifications:`, modifications);
    
    // For now, just acknowledge the modifications
    const confirmationText = `✅ Received ${modifications.length} modification(s). Processing...`;
    const message = {
      channel,
      text: confirmationText,
      threadTs
    };
    
    await slackClient.sendChannelMessage(channel, message);
  } catch (error) {
    console.error('Error handling user reply:', error);
    const errorMessage = createErrorMessage(
      'Failed to process your reply. Please try again.',
      channel,
      threadTs
    );
    await slackClient.sendExecutionPlanMessage(errorMessage);
  }
}

async function handleAdvancedUserReply(
  channel: string,
  user: string,
  text: string,
  threadTs?: string
): Promise<void> {
  try {
    const slackClient = createSlackMCPClient();
    const advancedProcessor = createAdvancedSlackInteractionProcessor();
    const linearClient = createLinearClient();
    
    await slackClient.connect();

    // Extract plan ID from thread context or message
    const planId = await extractPlanIdFromContext(channel, threadTs, text);
    if (!planId) {
      logger.warn('No plan ID found for message', { channel, user, text });
      return;
    }

    // Get team ID (this would typically be stored with the plan)
    const teamId = process.env.LINEAR_TEAM_ID;
    if (!teamId) {
      logger.error('LINEAR_TEAM_ID not configured');
      return;
    }

    // Fetch current data
    const availableTickets = await linearClient.getTicketsByTeam(teamId);
    const availableUsers = await linearClient.getTeamMembers(teamId);

    // Get previous messages from thread
    const previousMessages = await getThreadMessages(slackClient, channel, threadTs);

    // Create context for advanced processing
    const context = {
      userId: user,
      channelId: channel,
      messageTs: threadTs,
      planId,
      teamId,
      availableTickets,
      availableUsers,
      previousMessages,
      userPermissions: {
        allowedUsers: availableUsers.map(u => u.email),
        canReassign: true,
        canChangeStatus: true,
        canAddComments: true
      }
    };

    // Process the user's reply
    const result = await advancedProcessor.processUserReply(text, context);

    if (result.success && result.message) {
      await slackClient.sendExecutionPlanMessage(result.message);
      
      // If there are modifications, apply them to Linear
      if (result.modifications && result.modifications.length > 0) {
        await applyModificationsToLinear(result.modifications, linearClient);
      }
    } else {
      // Fallback to basic processing
      await handleUserReply(slackClient, createReplyProcessor(), channel, user, text, threadTs);
    }

    await slackClient.disconnect();
  } catch (error) {
    logger.error('Error in advanced user reply processing:', error);
    
    // Fallback to basic processing
    try {
      const slackClient = createSlackMCPClient();
      const replyProcessor = createReplyProcessor();
      await slackClient.connect();
      await handleUserReply(slackClient, replyProcessor, channel, user, text, threadTs);
      await slackClient.disconnect();
    } catch (fallbackError) {
      logger.error('Fallback processing also failed:', fallbackError);
    }
  }
}

async function extractPlanIdFromContext(
  channel: string,
  threadTs: string | undefined,
  text: string
): Promise<string | null> {
  // Try to extract plan ID from the message text
  const planIdMatch = text.match(/plan[_-]?id[:\s]+([a-zA-Z0-9-_]+)/i);
  if (planIdMatch) {
    return planIdMatch[1];
  }

  // Try to extract from thread context
  if (threadTs) {
    // This would typically query a database or cache for the plan ID
    // For now, return a placeholder
    return 'plan-' + Date.now();
  }

  return null;
}

async function getThreadMessages(
  slackClient: any,
  channel: string,
  threadTs: string | undefined
): Promise<Array<{ content: string; timestamp: Date; userId: string }>> {
  if (!threadTs) {
    return [];
  }

  try {
    // This would typically fetch thread messages from Slack API
    // For now, return empty array
    return [];
  } catch (error) {
    logger.error('Error fetching thread messages:', error);
    return [];
  }
}

async function applyModificationsToLinear(
  modifications: any[],
  linearClient: any
): Promise<void> {
  try {
    for (const modification of modifications) {
      switch (modification.action) {
        case 'status_change':
          await linearClient.updateTicketStatus(modification.ticketId, modification.value);
          break;
        case 'reassign':
          await linearClient.updateTicketAssignee(modification.ticketId, modification.value);
          break;
        case 'comment':
          await linearClient.addTicketComment(modification.ticketId, modification.value);
          break;
      }
    }
    
    logger.info('Successfully applied modifications to Linear', {
      modificationsCount: modifications.length
    });
  } catch (error) {
    logger.error('Error applying modifications to Linear:', error);
    throw error;
  }
}

async function handleHelpRequest(
  slackClient: any,
  channel: string,
  threadTs?: string
): Promise<void> {
  try {
    const helpMessage = createHelpMessage(channel, threadTs);
    await slackClient.sendExecutionPlanMessage(helpMessage);
  } catch (error) {
    console.error('Error handling help request:', error);
  }
}