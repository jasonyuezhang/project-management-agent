import { PlanGenerator } from './plan-generator.js';
import { LinearMCPClient } from './mcp/linear-client.js';
import { SlackMCPClient } from './mcp/slack-client.js';
import { ExecutionPlan, TeamSummary } from './mcp/types.js';
import { createExecutionPlanMessage, createTeamSummaryMessage } from './templates/slack-templates.js';

export interface ScheduleConfig {
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  adminUserId: string;
  teamId?: string;
  summaryChannelId?: string;
  summaryUserGroupId?: string;
}

export interface ExecutionSession {
  id: string;
  generatedAt: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'failed';
  adminUserId: string;
  teamId?: string;
  plans: ExecutionPlan[];
  teamSummary?: TeamSummary;
  messageIds: string[];
  errorMessage?: string;
}

export class PlanScheduler {
  private linearClient: LinearMCPClient;
  private slackClient: SlackMCPClient;
  private planGenerator: PlanGenerator;
  private currentSchedule?: NodeJS.Timeout;
  private sessions: Map<string, ExecutionSession> = new Map();

  constructor(
    linearClient: LinearMCPClient,
    slackClient: SlackMCPClient,
    planGenerator: PlanGenerator
  ) {
    this.linearClient = linearClient;
    this.slackClient = slackClient;
    this.planGenerator = planGenerator;
  }

  async scheduleExecution(config: ScheduleConfig): Promise<void> {
    if (this.currentSchedule) {
      this.cancelScheduledExecution();
    }

    if (!config.enabled) {
      return;
    }

    // Parse cron expression and schedule
    const cronParts = config.cronExpression.split(' ');
    if (cronParts.length !== 5) {
      throw new Error('Invalid cron expression. Expected format: "minute hour day month weekday"');
    }

    const [minute, hour, day, month, weekday] = cronParts;
    
    // For now, we'll use a simplified scheduling approach
    // In production, you'd want to use a proper cron library like node-cron
    const scheduleTime = this.parseCronExpression(minute, hour, day, month, weekday);
    
    if (scheduleTime) {
      const now = new Date();
      const delay = scheduleTime.getTime() - now.getTime();
      
      if (delay > 0) {
        this.currentSchedule = setTimeout(() => {
          this.executeScheduledPlan(config);
        }, delay);
        
        console.log(`Scheduled execution for ${scheduleTime.toISOString()}`);
      } else {
        console.warn('Scheduled time is in the past, skipping schedule');
      }
    }
  }

  async triggerManualExecution(adminUserId: string, teamId?: string): Promise<ExecutionSession> {
    const sessionId = this.generateSessionId();
    
    try {
      const session: ExecutionSession = {
        id: sessionId,
        generatedAt: new Date(),
        status: 'pending',
        adminUserId,
        teamId,
        plans: [],
        messageIds: []
      };

      this.sessions.set(sessionId, session);

      // Generate plans
      const plans = await this.planGenerator.generateIndividualPlans(teamId);
      session.plans = plans;

      // Generate team summary if teamId is provided
      if (teamId) {
        const teamSummary = await this.planGenerator.generateTeamSummary(teamId);
        session.teamSummary = teamSummary;
      }

      // Send messages to Slack
      await this.sendPlansToSlack(session);

      session.status = 'confirmed';
      return session;
    } catch (error) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      }
      throw error;
    }
  }

  async cancelScheduledExecution(): Promise<void> {
    if (this.currentSchedule) {
      clearTimeout(this.currentSchedule);
      this.currentSchedule = undefined;
      console.log('Scheduled execution cancelled');
    }
  }

  async getActiveSessions(): Promise<ExecutionSession[]> {
    return Array.from(this.sessions.values());
  }

  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async updateSessionStatus(sessionId: string, status: ExecutionSession['status'], errorMessage?: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      if (errorMessage) {
        session.errorMessage = errorMessage;
      }
    }
  }

  private async executeScheduledPlan(config: ScheduleConfig): Promise<void> {
    try {
      console.log('Executing scheduled plan generation...');
      await this.triggerManualExecution(config.adminUserId, config.teamId);
      console.log('Scheduled plan generation completed successfully');
    } catch (error) {
      console.error('Scheduled plan generation failed:', error);
    }
  }

  private async sendPlansToSlack(session: ExecutionSession): Promise<void> {
    await this.slackClient.connect();

    try {
      // Send individual plans to users
      for (const plan of session.plans) {
        try {
          // Get user's Slack ID (this would need to be implemented based on your user mapping)
          const slackUserId = await this.getSlackUserId(plan.userId);
          
          if (slackUserId) {
            const message = createExecutionPlanMessage(plan, slackUserId);
            const messageId = await this.slackClient.sendExecutionPlanMessage(message);
            session.messageIds.push(messageId);
          }
        } catch (error) {
          console.error(`Failed to send plan to user ${plan.userName}:`, error);
        }
      }

      // Send team summary if available
      if (session.teamSummary && session.teamSummary.teamId) {
        try {
          const summaryChannelId = await this.getSummaryChannelId(session.teamSummary.teamId);
          if (summaryChannelId) {
            const summaryMessage = createTeamSummaryMessage(session.teamSummary, summaryChannelId);
            const messageId = await this.slackClient.sendTeamSummaryMessage(summaryMessage);
            session.messageIds.push(messageId);
          }
        } catch (error) {
          console.error('Failed to send team summary:', error);
        }
      }
    } finally {
      await this.slackClient.disconnect();
    }
  }

  private async getSlackUserId(linearUserId: string): Promise<string | null> {
    // This is a placeholder implementation
    // In a real implementation, you'd need to maintain a mapping between Linear and Slack user IDs
    // This could be stored in a database or configuration file
    try {
      // For now, we'll try to find a user by their Linear ID
      // This assumes you have a way to map Linear users to Slack users
      const users = await this.slackClient.getUsers();
      // This is a simplified approach - you'd need proper user mapping logic
      return users[0]?.id || null;
    } catch (error) {
      console.error('Failed to get Slack user ID:', error);
      return null;
    }
  }

  private async getSummaryChannelId(teamId: string): Promise<string | null> {
    // This is a placeholder implementation
    // In a real implementation, you'd need to maintain a mapping between teams and channels
    try {
      const channels = await this.slackClient.getChannels();
      // Look for a channel named after the team or a general summary channel
      const summaryChannel = channels.find(channel => 
        channel.name.includes('summary') || 
        channel.name.includes('team') ||
        channel.name.includes('general')
      );
      return summaryChannel?.id || null;
    } catch (error) {
      console.error('Failed to get summary channel ID:', error);
      return null;
    }
  }

  private parseCronExpression(minute: string, hour: string, day: string, month: string, weekday: string): Date | null {
    // This is a simplified cron parser
    // In production, you'd want to use a proper cron library
    
    const now = new Date();
    const nextRun = new Date(now);
    
    // Handle minute
    if (minute !== '*') {
      const min = parseInt(minute);
      if (isNaN(min) || min < 0 || min > 59) return null;
      nextRun.setMinutes(min);
    }
    
    // Handle hour
    if (hour !== '*') {
      const h = parseInt(hour);
      if (isNaN(h) || h < 0 || h > 23) return null;
      nextRun.setHours(h);
    }
    
    // Handle day
    if (day !== '*') {
      const d = parseInt(day);
      if (isNaN(d) || d < 1 || d > 31) return null;
      nextRun.setDate(d);
    }
    
    // Handle month
    if (month !== '*') {
      const m = parseInt(month);
      if (isNaN(m) || m < 1 || m > 12) return null;
      nextRun.setMonth(m - 1); // JavaScript months are 0-indexed
    }
    
    // Handle weekday
    if (weekday !== '*') {
      const w = parseInt(weekday);
      if (isNaN(w) || w < 0 || w > 6) return null;
      // Adjust to next occurrence of this weekday
      const currentWeekday = nextRun.getDay();
      const daysUntilTarget = (w - currentWeekday + 7) % 7;
      nextRun.setDate(nextRun.getDate() + daysUntilTarget);
    }
    
    // If the scheduled time is in the past, move to next occurrence
    if (nextRun <= now) {
      if (weekday !== '*') {
        nextRun.setDate(nextRun.getDate() + 7);
      } else if (day !== '*') {
        nextRun.setMonth(nextRun.getMonth() + 1);
      } else if (hour !== '*') {
        nextRun.setDate(nextRun.getDate() + 1);
      } else if (minute !== '*') {
        nextRun.setHours(nextRun.getHours() + 1);
      }
    }
    
    return nextRun;
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  // Clean up old sessions (call this periodically)
  cleanupOldSessions(maxAgeHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.generatedAt < cutoffTime) {
        this.sessions.delete(sessionId);
      }
    }
  }

  // Get execution statistics
  getExecutionStats(): {
    totalSessions: number;
    pendingSessions: number;
    confirmedSessions: number;
    completedSessions: number;
    failedSessions: number;
  } {
    const sessions = Array.from(this.sessions.values());
    
    return {
      totalSessions: sessions.length,
      pendingSessions: sessions.filter(s => s.status === 'pending').length,
      confirmedSessions: sessions.filter(s => s.status === 'confirmed').length,
      completedSessions: sessions.filter(s => s.status === 'completed').length,
      failedSessions: sessions.filter(s => s.status === 'failed').length,
    };
  }
}

// Factory function to create a plan scheduler
export function createPlanScheduler(
  linearClient: LinearMCPClient,
  slackClient: SlackMCPClient,
  planGenerator: PlanGenerator
): PlanScheduler {
  return new PlanScheduler(linearClient, slackClient, planGenerator);
}