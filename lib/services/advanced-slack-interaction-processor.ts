import { createAdvancedReplyProcessor, AdvancedReplyProcessor, CommandContext, AdvancedParseResult } from '../processors/advanced-reply-processor.js';
import { createReplyProcessor } from '../processors/reply-processor.js';
import { createSlackClient } from '../mcp/slack-client.js';
import { createLinearClient } from '../mcp/linear-client.js';
import { 
  createExecutionPlanMessage, 
  createPlanModificationMessage, 
  createValidationErrorMessage,
  createHelpMessage,
  createConfirmationMessage
} from '../templates/slack-templates.js';
import { PlanModification, SlackExecutionPlanMessage } from '../mcp/slack-types.js';
import { ExecutionPlan, LinearIssue, LinearUser } from '../mcp/types.js';
import { logger } from '../monitoring/logger.js';

export interface SlackInteractionContext {
  userId: string;
  channelId: string;
  messageTs?: string;
  planId: string;
  teamId: string;
  availableTickets: LinearIssue[];
  availableUsers: LinearUser[];
  previousMessages: Array<{
    content: string;
    timestamp: Date;
    userId: string;
  }>;
  userPermissions?: {
    allowedUsers: string[];
    canReassign: boolean;
    canChangeStatus: boolean;
    canAddComments: boolean;
  };
}

export interface ProcessingResult {
  success: boolean;
  message?: SlackExecutionPlanMessage;
  modifications?: PlanModification[];
  errors?: string[];
  warnings?: string[];
  guidance?: string;
}

export class AdvancedSlackInteractionProcessor {
  private advancedProcessor: AdvancedReplyProcessor;
  private basicProcessor: any;
  private slackClient: any;
  private linearClient: any;

  constructor() {
    this.advancedProcessor = createAdvancedReplyProcessor();
    this.basicProcessor = createReplyProcessor();
    this.slackClient = createSlackClient();
    this.linearClient = createLinearClient();
  }

  async processUserReply(
    message: string,
    context: SlackInteractionContext
  ): Promise<ProcessingResult> {
    try {
      logger.info('Processing user reply', { 
        userId: context.userId, 
        planId: context.planId,
        messageLength: message.length 
      });

      // Create command context for advanced processing
      const commandContext: CommandContext = {
        userId: context.userId,
        planId: context.planId,
        availableTickets: context.availableTickets,
        availableUsers: context.availableUsers.map(u => u.email),
        previousMessages: context.previousMessages,
        userPermissions: context.userPermissions
      };

      // Parse the user's reply using advanced processing
      const parseResult = await this.advancedProcessor.parseAdvancedReply(message, commandContext);

      // Handle help requests
      if (parseResult.commands.some(cmd => cmd.type === 'help')) {
        const helpMessage = createHelpMessage(context.channelId, context.messageTs);
        return {
          success: true,
          message: helpMessage
        };
      }

      // Handle errors and provide guidance
      if (parseResult.errors.length > 0) {
        const errorMessage = createValidationErrorMessage(
          parseResult.errors.map(e => e.message),
          parseResult.warnings,
          context.channelId,
          context.messageTs
        );
        
        return {
          success: false,
          message: errorMessage,
          errors: parseResult.errors.map(e => e.message),
          warnings: parseResult.warnings
        };
      }

      // Convert parsed commands to modifications
      const modifications = this.convertCommandsToModifications(parseResult.commands, context.userId);

      // Validate modifications
      const validationResult = await this.advancedProcessor.validateAdvancedModifications(
        modifications,
        context.availableTickets,
        context.availableUsers,
        context.userPermissions
      );

      if (!validationResult.isValid) {
        const errorMessage = createValidationErrorMessage(
          validationResult.errors,
          validationResult.warnings,
          context.channelId,
          context.messageTs
        );
        
        return {
          success: false,
          message: errorMessage,
          errors: validationResult.errors,
          warnings: validationResult.warnings
        };
      }

      // Handle confirmation
      if (modifications.some(mod => mod.ticketId === 'ALL' && mod.action === 'comment' && mod.value === 'Plan confirmed by user')) {
        const confirmationMessage = createConfirmationMessage(
          context.planId,
          context.channelId,
          context.messageTs
        );
        
        return {
          success: true,
          message: confirmationMessage,
          modifications: []
        };
      }

      // Create modification message
      const modificationMessage = createPlanModificationMessage(
        context.planId,
        modifications,
        context.channelId,
        context.messageTs
      );

      logger.info('Successfully processed user reply', {
        userId: context.userId,
        planId: context.planId,
        modificationsCount: modifications.length
      });

      return {
        success: true,
        message: modificationMessage,
        modifications: validationResult.modifications,
        warnings: validationResult.warnings
      };

    } catch (error) {
      logger.error('Error processing user reply', {
        userId: context.userId,
        planId: context.planId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      const errorMessage = createValidationErrorMessage(
        ['An unexpected error occurred while processing your request'],
        [],
        context.channelId,
        context.messageTs
      );

      return {
        success: false,
        message: errorMessage,
        errors: ['Processing error']
      };
    }
  }

  async processInteractiveAction(
    action: any,
    context: SlackInteractionContext
  ): Promise<ProcessingResult> {
    try {
      logger.info('Processing interactive action', {
        userId: context.userId,
        actionId: action.action_id,
        planId: context.planId
      });

      switch (action.action_id) {
        case 'confirm_plan':
          return await this.handlePlanConfirmation(context);
        
        case 'request_changes':
          return await this.handleChangeRequest(context);
        
        case 'view_individual_plans':
          return await this.handleViewIndividualPlans(context);
        
        case 'refresh_summary':
          return await this.handleRefreshSummary(context);
        
        default:
          logger.warn('Unknown interactive action', { actionId: action.action_id });
          return {
            success: false,
            errors: ['Unknown action']
          };
      }
    } catch (error) {
      logger.error('Error processing interactive action', {
        userId: context.userId,
        actionId: action.action_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        errors: ['Action processing error']
      };
    }
  }

  private convertCommandsToModifications(commands: any[], userId: string): PlanModification[] {
    return commands.map(cmd => ({
      ticketId: cmd.ticketId || 'ALL',
      action: cmd.type === 'status_change' ? 'status_change' : 
              cmd.type === 'reassign' ? 'reassign' : 'comment',
      value: cmd.value || '',
      userId,
      timestamp: new Date(),
      originalMessage: cmd.originalText
    }));
  }

  private async handlePlanConfirmation(context: SlackInteractionContext): Promise<ProcessingResult> {
    const confirmationMessage = createConfirmationMessage(
      context.planId,
      context.channelId,
      context.messageTs
    );

    return {
      success: true,
      message: confirmationMessage,
      modifications: []
    };
  }

  private async handleChangeRequest(context: SlackInteractionContext): Promise<ProcessingResult> {
    const helpMessage = createHelpMessage(context.channelId, context.messageTs);
    
    return {
      success: true,
      message: helpMessage
    };
  }

  private async handleViewIndividualPlans(context: SlackInteractionContext): Promise<ProcessingResult> {
    // This would typically fetch and display individual plans
    // For now, return a placeholder message
    const message: SlackExecutionPlanMessage = {
      channel: context.channelId,
      text: 'Individual plans would be displayed here',
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Individual plans feature coming soon!'
        }
      }],
      attachments: [],
      threadTs: context.messageTs
    };

    return {
      success: true,
      message
    };
  }

  private async handleRefreshSummary(context: SlackInteractionContext): Promise<ProcessingResult> {
    // This would typically refresh the team summary
    // For now, return a placeholder message
    const message: SlackExecutionPlanMessage = {
      channel: context.channelId,
      text: 'Summary refreshed',
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Team summary has been refreshed!'
        }
      }],
      attachments: [],
      threadTs: context.messageTs
    };

    return {
      success: true,
      message
    };
  }

  async getContextualHelp(
    context: SlackInteractionContext,
    specificTopic?: string
  ): Promise<SlackExecutionPlanMessage> {
    const commandContext: CommandContext = {
      userId: context.userId,
      planId: context.planId,
      availableTickets: context.availableTickets,
      availableUsers: context.availableUsers.map(u => u.email),
      previousMessages: context.previousMessages,
      userPermissions: context.userPermissions
    };

    const guidance = await this.advancedProcessor.getUserGuidance(
      specificTopic || 'help',
      commandContext
    );

    const message: SlackExecutionPlanMessage = {
      channel: context.channelId,
      text: guidance.content,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${guidance.content}*`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Examples:*\n${guidance.examples.map(ex => `• ${ex}`).join('\n')}`
          }
        }
      ],
      attachments: [],
      threadTs: context.messageTs
    };

    return message;
  }

  async analyzeUserBehavior(
    userId: string,
    messages: Array<{ content: string; timestamp: Date; userId: string }>
  ): Promise<{
    commonPatterns: string[];
    suggestedImprovements: string[];
    confidence: number;
  }> {
    const patterns: string[] = [];
    const improvements: string[] = [];
    let confidence = 0;

    // Analyze message patterns
    const moveCommands = messages.filter(msg => 
      msg.content.toLowerCase().includes('move') && 
      msg.content.toLowerCase().includes('to')
    ).length;

    const reassignCommands = messages.filter(msg => 
      msg.content.toLowerCase().includes('reassign')
    ).length;

    const commentCommands = messages.filter(msg => 
      msg.content.toLowerCase().includes('comment')
    ).length;

    const totalCommands = moveCommands + reassignCommands + commentCommands;

    if (totalCommands > 0) {
      confidence = Math.min(totalCommands / 10, 1); // Confidence based on usage

      if (moveCommands > reassignCommands + commentCommands) {
        patterns.push('Prefers status changes over reassignments');
      }

      if (reassignCommands > moveCommands + commentCommands) {
        patterns.push('Frequently reassigns tickets');
      }

      if (commentCommands > moveCommands + reassignCommands) {
        patterns.push('Adds many comments to tickets');
      }

      // Suggest improvements
      if (moveCommands > 0 && reassignCommands === 0) {
        improvements.push('Consider using reassignment commands to distribute workload');
      }

      if (commentCommands === 0) {
        improvements.push('Try adding comments to provide context for your changes');
      }
    }

    return {
      commonPatterns: patterns,
      suggestedImprovements: improvements,
      confidence
    };
  }
}

// Factory function to create the advanced interaction processor
export function createAdvancedSlackInteractionProcessor(): AdvancedSlackInteractionProcessor {
  return new AdvancedSlackInteractionProcessor();
}