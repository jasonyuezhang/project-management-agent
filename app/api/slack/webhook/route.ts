import { NextRequest, NextResponse } from 'next/server';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';
import { createReplyProcessor } from '@/lib/processors/reply-processor';
import { createConfirmationMessage, createErrorMessage, createHelpMessage } from '@/lib/templates/slack-templates';
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

    const slackClient = createSlackMCPClient();
    const replyProcessor = createReplyProcessor();
    
    await slackClient.connect();

    // Check if message contains modifications
    if (replyProcessor.containsModifications(text)) {
      await handleUserReply(slackClient, replyProcessor, channel, user, text, threadTs);
    } else if (text.toLowerCase().includes('help')) {
      await handleHelpRequest(slackClient, channel, threadTs);
    }

    await slackClient.disconnect();

    return NextResponse.json({
      success: true,
      message: 'Message processed'
    });
  } catch (error) {
    console.error('Error handling message event:', error);
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