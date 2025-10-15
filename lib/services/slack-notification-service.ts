import { SlackMCPClient } from '../mcp/slack-client';
import { 
  createExecutionPlanMessage,
  createTeamSummaryMessage,
  createConfirmationMessage,
  createErrorMessage,
  createHelpMessage
} from '../templates/slack-templates';
import { ExecutionPlan, TeamSummary } from '../mcp/types';
import { SlackUser, SlackChannel } from '../mcp/slack-types';

export interface NotificationConfig {
  executionPlanChannel?: string;
  teamSummaryChannel?: string;
  adminChannel?: string;
  userGroupId?: string;
  adminUserIds: string[];
}

export interface PlanUpdateNotification {
  type: 'plan_generated' | 'plan_confirmed' | 'plan_modified' | 'plan_error';
  planId: string;
  userId: string;
  userName: string;
  channelId: string;
  threadTs?: string;
  error?: string;
  modifications?: any[];
}

export interface TeamUpdateNotification {
  type: 'summary_generated' | 'summary_updated';
  teamId: string;
  teamName: string;
  channelId: string;
  completionRate?: number;
  totalTickets?: number;
}

export class SlackNotificationService {
  private slackClient: SlackMCPClient;
  private config: NotificationConfig;

  constructor(slackClient: SlackMCPClient, config: NotificationConfig) {
    this.slackClient = slackClient;
    this.config = config;
  }

  async sendExecutionPlan(plan: ExecutionPlan, userId: string): Promise<string> {
    try {
      const channelId = await this.getUserChannel(userId);
      const message = createExecutionPlanMessage(plan, channelId);
      
      const messageId = await this.slackClient.sendExecutionPlanMessage(message);
      
      // Log the notification
      console.log(`Execution plan sent to user ${userId} (${plan.userName})`);
      
      return messageId;
    } catch (error) {
      console.error('Failed to send execution plan:', error);
      throw new Error('Failed to send execution plan');
    }
  }

  async sendTeamSummary(summary: TeamSummary): Promise<string> {
    try {
      const channelId = this.config.teamSummaryChannel || this.config.executionPlanChannel;
      
      if (!channelId) {
        throw new Error('No team summary channel configured');
      }

      const message = createTeamSummaryMessage(summary, channelId);
      const messageId = await this.slackClient.sendTeamSummaryMessage(message);
      
      // Log the notification
      console.log(`Team summary sent to channel ${channelId}`);
      
      return messageId;
    } catch (error) {
      console.error('Failed to send team summary:', error);
      throw new Error('Failed to send team summary');
    }
  }

  async sendPlanUpdate(notification: PlanUpdateNotification): Promise<void> {
    try {
      let message;

      switch (notification.type) {
        case 'plan_confirmed':
          message = createConfirmationMessage(
            notification.planId,
            notification.channelId,
            notification.threadTs
          );
          break;

        case 'plan_error':
          message = createErrorMessage(
            notification.error || 'Unknown error occurred',
            notification.channelId,
            notification.threadTs
          );
          break;

        case 'plan_modified':
          // TODO: Create plan modification message template
          message = createConfirmationMessage(
            notification.planId,
            notification.channelId,
            notification.threadTs
          );
          break;

        default:
          console.log(`Unknown plan update type: ${notification.type}`);
          return;
      }

      await this.slackClient.sendExecutionPlanMessage(message);
      
      // Log the notification
      console.log(`Plan update sent: ${notification.type} for plan ${notification.planId}`);
    } catch (error) {
      console.error('Failed to send plan update:', error);
      throw new Error('Failed to send plan update');
    }
  }

  async sendTeamUpdate(notification: TeamUpdateNotification): Promise<void> {
    try {
      // TODO: Create team update message template
      console.log(`Team update: ${notification.type} for team ${notification.teamId}`);
    } catch (error) {
      console.error('Failed to send team update:', error);
      throw new Error('Failed to send team update');
    }
  }

  async sendAdminNotification(
    type: 'plan_generation_failed' | 'system_error' | 'user_error',
    message: string,
    details?: any
  ): Promise<void> {
    try {
      if (!this.config.adminChannel) {
        console.warn('No admin channel configured, skipping admin notification');
        return;
      }

      const adminMessage = {
        channel: this.config.adminChannel,
        text: `🚨 Admin Alert: ${type}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${type.replace(/_/g, ' ').toUpperCase()}*\n\n${message}`
            }
          }
        ]
      };

      if (details) {
        adminMessage.blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Details:*\n\`\`\`${JSON.stringify(details, null, 2)}\`\`\``
          }
        });
      }

      await this.slackClient.sendChannelMessage(this.config.adminChannel, adminMessage);
      
      // Log the notification
      console.log(`Admin notification sent: ${type}`);
    } catch (error) {
      console.error('Failed to send admin notification:', error);
      // Don't throw here to avoid infinite loops
    }
  }

  async sendBulkNotifications(
    plans: ExecutionPlan[],
    summary?: TeamSummary
  ): Promise<{ planIds: string[]; summaryId?: string; errors: string[] }> {
    const results = {
      planIds: [] as string[],
      summaryId: undefined as string | undefined,
      errors: [] as string[]
    };

    // Send individual plans
    for (const plan of plans) {
      try {
        const messageId = await this.sendExecutionPlan(plan, plan.userId);
        results.planIds.push(messageId);
      } catch (error) {
        const errorMsg = `Failed to send plan for user ${plan.userName}: ${error}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    // Send team summary if provided
    if (summary) {
      try {
        const summaryId = await this.sendTeamSummary(summary);
        results.summaryId = summaryId;
      } catch (error) {
        const errorMsg = `Failed to send team summary: ${error}`;
        results.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    return results;
  }

  async sendReminderNotification(
    planId: string,
    userId: string,
    userName: string,
    channelId: string,
    threadTs?: string
  ): Promise<void> {
    try {
      const message = {
        channel: channelId,
        text: `⏰ Reminder: Please review your execution plan`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⏰ *Reminder for ${userName}*\n\nPlease review and confirm your execution plan. If you need help, reply with "help".`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ Confirm Plan'
                },
                style: 'primary',
                actionId: 'confirm_plan',
                value: planId
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '❓ Get Help'
                },
                actionId: 'request_changes',
                value: planId
              }
            ]
          }
        ],
        threadTs
      };

      await this.slackClient.sendChannelMessage(channelId, message);
      
      // Log the notification
      console.log(`Reminder sent to user ${userName} for plan ${planId}`);
    } catch (error) {
      console.error('Failed to send reminder notification:', error);
      throw new Error('Failed to send reminder notification');
    }
  }

  private async getUserChannel(userId: string): Promise<string> {
    try {
      // Try to get user's DM channel
      const user = await this.slackClient.getUserByEmail(userId);
      if (user) {
        // For now, return the execution plan channel
        // TODO: Implement DM channel creation
        return this.config.executionPlanChannel || this.config.teamSummaryChannel || '';
      }
      
      throw new Error('User not found');
    } catch (error) {
      console.error('Failed to get user channel:', error);
      // Fallback to execution plan channel
      return this.config.executionPlanChannel || this.config.teamSummaryChannel || '';
    }
  }

  async getNotificationStats(): Promise<{
    totalPlansSent: number;
    totalSummariesSent: number;
    totalErrors: number;
    lastNotificationTime?: Date;
  }> {
    // TODO: Implement notification statistics tracking
    return {
      totalPlansSent: 0,
      totalSummariesSent: 0,
      totalErrors: 0
    };
  }
}

// Factory function
export function createSlackNotificationService(
  slackClient: SlackMCPClient,
  config: NotificationConfig
): SlackNotificationService {
  return new SlackNotificationService(slackClient, config);
}