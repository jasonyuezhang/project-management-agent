import { NextRequest, NextResponse } from 'next/server';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';
import { createReplyProcessor } from '@/lib/processors/reply-processor';
import { createConfirmationMessage, createErrorMessage } from '@/lib/templates/slack-templates';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';

export async function POST(request: NextRequest) {
  try {
    const { 
      reply, 
      userId, 
      channelId, 
      planId, 
      threadTs,
      availableTickets = [],
      availableUsers = []
    } = await request.json();

    if (!reply || !userId || !channelId || !planId) {
      return NextResponse.json({
        success: false,
        message: 'Missing required parameters: reply, userId, channelId, planId'
      }, { status: 400 });
    }

    const slackClient = createSlackMCPClient();
    const replyProcessor = createReplyProcessor();
    const linearClient = createLinearMCPClient();

    await Promise.all([
      slackClient.connect(),
      linearClient.connect()
    ]);

    try {
      // Parse user reply
      const modifications = await replyProcessor.parseUserReply(reply, userId);
      
      if (modifications.length === 0) {
        return NextResponse.json({
          success: false,
          message: 'No valid modifications found in reply',
          data: { modifications: [] }
        });
      }

      // Validate modifications
      const validation = await replyProcessor.validateModifications(
        modifications,
        availableTickets,
        availableUsers
      );

      if (!validation.isValid) {
        const errorMessage = createErrorMessage(
          `Validation failed: ${validation.errors.join(', ')}`,
          channelId,
          threadTs
        );
        await slackClient.sendExecutionPlanMessage(errorMessage);

        return NextResponse.json({
          success: false,
          message: 'Validation failed',
          data: {
            errors: validation.errors,
            warnings: validation.warnings,
            modifications: validation.modifications
          }
        });
      }

      // Apply modifications to Linear
      const results = await applyModificationsToLinear(linearClient, validation.modifications);

      // Send confirmation message
      const confirmationMessage = createConfirmationMessage(planId, channelId, threadTs);
      await slackClient.sendExecutionPlanMessage(confirmationMessage);

      // TODO: Update plan status in database
      // TODO: Log modifications for audit trail

      return NextResponse.json({
        success: true,
        message: 'Reply processed successfully',
        data: {
          modifications: validation.modifications,
          results,
          warnings: validation.warnings
        }
      });

    } finally {
      await Promise.all([
        slackClient.disconnect(),
        linearClient.disconnect()
      ]);
    }
  } catch (error) {
    console.error('Error processing reply:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to process reply',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function applyModificationsToLinear(
  linearClient: any,
  modifications: any[]
): Promise<Array<{ success: boolean; error?: string; modification: any }>> {
  const results = [];

  for (const modification of modifications) {
    try {
      switch (modification.action) {
        case 'status_change':
          await linearClient.updateTicketStatus(modification.ticketId, modification.value);
          results.push({ success: true, modification });
          break;

        case 'reassign':
          await linearClient.updateTicketAssignee(modification.ticketId, modification.value);
          results.push({ success: true, modification });
          break;

        case 'comment':
          await linearClient.addTicketComment(modification.ticketId, modification.value);
          results.push({ success: true, modification });
          break;

        default:
          results.push({ 
            success: false, 
            error: `Unknown action: ${modification.action}`,
            modification 
          });
      }
    } catch (error) {
      console.error(`Error applying modification:`, error);
      results.push({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        modification 
      });
    }
  }

  return results;
}