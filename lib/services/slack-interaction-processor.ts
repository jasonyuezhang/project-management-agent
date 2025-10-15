import { SlackMCPClient } from '../mcp/slack-client';
import { ReplyProcessor } from '../processors/reply-processor';
import { 
  createConfirmationMessage, 
  createErrorMessage, 
  createHelpMessage,
  createExecutionPlanMessage 
} from '../templates/slack-templates';
import { PlanModification, ValidationResult } from '../mcp/slack-types';
import { LinearIssue, LinearUser } from '../mcp/types';

export interface SlackInteraction {
  type: 'button_click' | 'message_reply' | 'help_request';
  channel: string;
  user: string;
  text?: string;
  actionId?: string;
  value?: string;
  threadTs?: string;
  planId?: string;
  teamId?: string;
}

export interface InteractionContext {
  availableTickets: LinearIssue[];
  availableUsers: LinearUser[];
  planId?: string;
  teamId?: string;
}

export class SlackInteractionProcessor {
  private slackClient: SlackMCPClient;
  private replyProcessor: ReplyProcessor;

  constructor(slackClient: SlackMCPClient) {
    this.slackClient = slackClient;
    this.replyProcessor = new ReplyProcessor();
  }

  async processInteraction(
    interaction: SlackInteraction,
    context: InteractionContext
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      switch (interaction.type) {
        case 'button_click':
          return await this.handleButtonClick(interaction, context);
          
        case 'message_reply':
          return await this.handleMessageReply(interaction, context);
          
        case 'help_request':
          return await this.handleHelpRequest(interaction);
          
        default:
          return {
            success: false,
            error: `Unknown interaction type: ${interaction.type}`
          };
      }
    } catch (error) {
      console.error('Error processing interaction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async handleButtonClick(
    interaction: SlackInteraction,
    context: InteractionContext
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const { actionId, value, channel, user, threadTs } = interaction;

    switch (actionId) {
      case 'confirm_plan':
        return await this.handlePlanConfirmation(channel, user, value, threadTs);
        
      case 'request_changes':
        return await this.handleRequestChanges(channel, user, value, threadTs);
        
      case 'view_individual_plans':
        return await this.handleViewIndividualPlans(channel, user, value, context);
        
      case 'refresh_summary':
        return await this.handleRefreshSummary(channel, user, value, context);
        
      default:
        return {
          success: false,
          error: `Unknown action: ${actionId}`
        };
    }
  }

  private async handleMessageReply(
    interaction: SlackInteraction,
    context: InteractionContext
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const { text, channel, user, threadTs } = interaction;

    if (!text) {
      return {
        success: false,
        error: 'No text provided in message reply'
      };
    }

    // Check if message contains modifications
    if (!this.replyProcessor.containsModifications(text)) {
      return {
        success: false,
        message: 'No valid modifications found in message'
      };
    }

    // Parse modifications
    const modifications = await this.replyProcessor.parseUserReply(text, user);
    
    if (modifications.length === 0) {
      const helpMessage = createHelpMessage(channel, threadTs);
      await this.slackClient.sendExecutionPlanMessage(helpMessage);
      
      return {
        success: true,
        message: 'Help message sent'
      };
    }

    // Validate modifications
    const validation = await this.replyProcessor.validateModifications(
      modifications,
      context.availableTickets,
      context.availableUsers.map(u => u.email)
    );

    if (!validation.isValid) {
      const errorMessage = createErrorMessage(
        `Validation failed: ${validation.errors.join(', ')}`,
        channel,
        threadTs
      );
      await this.slackClient.sendExecutionPlanMessage(errorMessage);

      return {
        success: false,
        message: 'Validation failed',
        error: validation.errors.join(', ')
      };
    }

    // TODO: Apply modifications to Linear
    // TODO: Update plan status in database

    // Send confirmation
    const confirmationMessage = createConfirmationMessage(
      context.planId || 'unknown',
      channel,
      threadTs
    );
    await this.slackClient.sendExecutionPlanMessage(confirmationMessage);

    return {
      success: true,
      message: `Processed ${modifications.length} modifications`
    };
  }

  private async handleHelpRequest(
    interaction: SlackInteraction
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const { channel, threadTs } = interaction;

    try {
      const helpMessage = createHelpMessage(channel, threadTs);
      await this.slackClient.sendExecutionPlanMessage(helpMessage);
      
      return {
        success: true,
        message: 'Help message sent'
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to send help message'
      };
    }
  }

  private async handlePlanConfirmation(
    channel: string,
    user: string,
    planId: string,
    threadTs?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const message = createConfirmationMessage(planId, channel, threadTs);
      await this.slackClient.sendExecutionPlanMessage(message);
      
      // TODO: Update plan status in database
      console.log(`Plan ${planId} confirmed by user ${user}`);
      
      return {
        success: true,
        message: 'Plan confirmed successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to confirm plan'
      };
    }
  }

  private async handleRequestChanges(
    channel: string,
    user: string,
    planId: string,
    threadTs?: string
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const helpMessage = createHelpMessage(channel, threadTs);
      await this.slackClient.sendExecutionPlanMessage(helpMessage);
      
      return {
        success: true,
        message: 'Help message sent for plan changes'
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to send help message'
      };
    }
  }

  private async handleViewIndividualPlans(
    channel: string,
    user: string,
    teamId: string,
    context: InteractionContext
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // TODO: Fetch and display individual plans for the team
      console.log(`User ${user} requested individual plans for team ${teamId}`);
      
      return {
        success: true,
        message: 'Individual plans request processed'
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch individual plans'
      };
    }
  }

  private async handleRefreshSummary(
    channel: string,
    user: string,
    teamId: string,
    context: InteractionContext
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      // TODO: Refresh team summary
      console.log(`User ${user} requested refresh for team ${teamId}`);
      
      return {
        success: true,
        message: 'Summary refresh request processed'
      };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to refresh summary'
      };
    }
  }

  // Helper method to extract interaction from Slack payload
  static extractInteraction(payload: any): SlackInteraction | null {
    // Handle button clicks
    if (payload.type === 'block_actions') {
      const actions = payload.actions || [];
      if (actions.length === 0) return null;

      const action = actions[0];
      return {
        type: 'button_click',
        channel: payload.channel?.id || '',
        user: payload.user?.id || '',
        actionId: action.action_id,
        value: action.value,
        threadTs: payload.message?.thread_ts
      };
    }

    // Handle message events
    if (payload.type === 'event_callback') {
      const event = payload.event;
      if (event.type !== 'message' || event.bot_id) return null;

      const text = event.text?.toLowerCase() || '';
      const isHelpRequest = text.includes('help') || text.includes('?');
      
      return {
        type: isHelpRequest ? 'help_request' : 'message_reply',
        channel: event.channel,
        user: event.user,
        text: event.text,
        threadTs: event.thread_ts
      };
    }

    return null;
  }

  // Helper method to create interaction context
  static createContext(
    planId?: string,
    teamId?: string,
    availableTickets: LinearIssue[] = [],
    availableUsers: LinearUser[] = []
  ): InteractionContext {
    return {
      planId,
      teamId,
      availableTickets,
      availableUsers
    };
  }
}

// Factory function
export function createSlackInteractionProcessor(slackClient: SlackMCPClient): SlackInteractionProcessor {
  return new SlackInteractionProcessor(slackClient);
}