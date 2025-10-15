import { SessionManagementService, SessionCreationData, ModificationData } from './session-management-service.js';
import { ExecutionPlan } from '../mcp/types.js';
import { LinearUpdater } from '../updaters/linear-updater.js';
import { SlackNotificationService } from './slack-notification-service.js';
import { PlanGenerator } from '../plan-generator.js';

export interface ExecutionSessionIntegrationConfig {
  sessionManagement: {
    databasePath?: string;
    autoCleanupDays?: number;
  };
  linear: {
    apiKey: string;
    teamId: string;
  };
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
  };
}

export interface ExecutionSessionResult {
  sessionId: string;
  status: 'created' | 'confirmed' | 'completed' | 'cancelled';
  planCount: number;
  modificationCount: number;
  processedModifications: number;
  errors: string[];
}

export class ExecutionSessionIntegration {
  private sessionService: SessionManagementService;
  private linearUpdater: LinearUpdater;
  private slackService: SlackNotificationService;
  private planGenerator: PlanGenerator;

  constructor(config: ExecutionSessionIntegrationConfig) {
    this.sessionService = new SessionManagementService(config.sessionManagement);
    this.linearUpdater = new LinearUpdater(config.linear.apiKey, config.linear.teamId);
    this.slackService = new SlackNotificationService(config.slack);
    this.planGenerator = new PlanGenerator(config.linear.apiKey, config.linear.teamId);
  }

  async createExecutionSession(adminUserId: string, teamId: string): Promise<ExecutionSessionResult> {
    try {
      // Generate execution plans
      const plans = await this.planGenerator.generateIndividualPlans();
      
      // Create session
      const sessionData: SessionCreationData = {
        adminUserId,
        teamId,
        planCount: plans.length
      };

      const session = await this.sessionService.createExecutionSession(sessionData);
      
      // Store plans in Linear
      await this.linearUpdater.storeExecutionPlans(plans);
      
      // Send notifications via Slack
      await this.sendPlanNotifications(session.id, plans);

      return {
        sessionId: session.id,
        status: 'created',
        planCount: plans.length,
        modificationCount: 0,
        processedModifications: 0,
        errors: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        sessionId: '',
        status: 'cancelled',
        planCount: 0,
        modificationCount: 0,
        processedModifications: 0,
        errors: [errorMessage]
      };
    }
  }

  async processUserModification(
    sessionId: string,
    userId: string,
    ticketId: string,
    action: 'status_change' | 'reassign' | 'comment',
    value: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Add modification to session
      const modificationData: ModificationData = {
        sessionId,
        ticketId,
        userId,
        action,
        value
      };

      await this.sessionService.addPlanModification(modificationData);

      // Process the modification immediately
      const result = await this.processModificationInLinear(ticketId, action, value);

      if (result.success) {
        // Mark modification as processed
        const modifications = await this.sessionService.getSessionModifications(sessionId);
        const modification = modifications.find(m => 
          m.ticketId === ticketId && 
          m.userId === userId && 
          m.action === action && 
          m.value === value
        );
        
        if (modification) {
          await this.sessionService.markModificationProcessed(modification.id);
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  async confirmSession(sessionId: string): Promise<ExecutionSessionResult> {
    try {
      // Confirm session
      const confirmed = await this.sessionService.confirmSession(sessionId);
      if (!confirmed) {
        throw new Error('Failed to confirm session');
      }

      // Process all pending modifications
      const processResult = await this.sessionService.processModifications(sessionId);

      return {
        sessionId,
        status: 'confirmed',
        planCount: 0, // Will be updated by caller
        modificationCount: processResult.processed + processResult.errors,
        processedModifications: processResult.processed,
        errors: processResult.results
          .filter(r => !r.success)
          .map(r => r.error || 'Unknown error')
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        sessionId,
        status: 'cancelled',
        planCount: 0,
        modificationCount: 0,
        processedModifications: 0,
        errors: [errorMessage]
      };
    }
  }

  async completeSession(sessionId: string): Promise<ExecutionSessionResult> {
    try {
      // Complete session
      const completed = await this.sessionService.completeSession(sessionId);
      if (!completed) {
        throw new Error('Failed to complete session');
      }

      // Get session summary
      const summary = await this.sessionService.getSessionSummary(sessionId);
      if (!summary) {
        throw new Error('Session not found');
      }

      // Send completion notification
      await this.sendCompletionNotification(sessionId, summary);

      return {
        sessionId,
        status: 'completed',
        planCount: summary.session.planCount || 0,
        modificationCount: summary.modificationCount,
        processedModifications: summary.processedCount,
        errors: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        sessionId,
        status: 'cancelled',
        planCount: 0,
        modificationCount: 0,
        processedModifications: 0,
        errors: [errorMessage]
      };
    }
  }

  async cancelSession(sessionId: string, reason?: string): Promise<ExecutionSessionResult> {
    try {
      // Cancel session
      const cancelled = await this.sessionService.cancelSession(sessionId);
      if (!cancelled) {
        throw new Error('Failed to cancel session');
      }

      // Send cancellation notification
      await this.sendCancellationNotification(sessionId, reason);

      return {
        sessionId,
        status: 'cancelled',
        planCount: 0,
        modificationCount: 0,
        processedModifications: 0,
        errors: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        sessionId,
        status: 'cancelled',
        planCount: 0,
        modificationCount: 0,
        processedModifications: 0,
        errors: [errorMessage]
      };
    }
  }

  async getSessionStatus(sessionId: string): Promise<ExecutionSessionResult | null> {
    try {
      const summary = await this.sessionService.getSessionSummary(sessionId);
      if (!summary) return null;

      return {
        sessionId,
        status: summary.session.status,
        planCount: summary.session.planCount || 0,
        modificationCount: summary.modificationCount,
        processedModifications: summary.processedCount,
        errors: []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        sessionId,
        status: 'cancelled',
        planCount: 0,
        modificationCount: 0,
        processedModifications: 0,
        errors: [errorMessage]
      };
    }
  }

  async getActiveSessions(): Promise<ExecutionSessionResult[]> {
    try {
      const activeSessions = await this.sessionService.getActiveSessions();
      
      const results: ExecutionSessionResult[] = [];
      for (const session of activeSessions) {
        const summary = await this.sessionService.getSessionSummary(session.id);
        if (summary) {
          results.push({
            sessionId: session.id,
            status: session.status,
            planCount: session.planCount || 0,
            modificationCount: summary.modificationCount,
            processedModifications: summary.processedCount,
            errors: []
          });
        }
      }

      return results;
    } catch (error) {
      return [];
    }
  }

  async cleanupOldSessions(daysOld: number = 30): Promise<{ deletedSessions: number; deletedModifications: number }> {
    return await this.sessionService.cleanupOldSessions(daysOld);
  }

  async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    totalModifications: number;
    processedModifications: number;
    errorModifications: number;
  }> {
    const stats = await this.sessionService.getSessionStats();
    const activeSessions = await this.sessionService.getActiveSessions();

    return {
      totalSessions: stats.totalSessions,
      activeSessions: activeSessions.length,
      completedSessions: stats.completedSessions,
      totalModifications: stats.totalModifications,
      processedModifications: stats.processedModifications,
      errorModifications: stats.errorModifications
    };
  }

  private async processModificationInLinear(
    ticketId: string,
    action: 'status_change' | 'reassign' | 'comment',
    value: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      switch (action) {
        case 'status_change':
          await this.linearUpdater.updateTicketStatus(ticketId, value);
          break;
        case 'reassign':
          await this.linearUpdater.reassignTicket(ticketId, value);
          break;
        case 'comment':
          await this.linearUpdater.addTicketComment(ticketId, value);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  private async sendPlanNotifications(sessionId: string, plans: ExecutionPlan[]): Promise<void> {
    // This would integrate with the Slack notification service
    // For now, we'll just log the action
    console.log(`Sending plan notifications for session ${sessionId} with ${plans.length} plans`);
  }

  private async sendCompletionNotification(sessionId: string, summary: any): Promise<void> {
    // This would send a completion notification via Slack
    console.log(`Sending completion notification for session ${sessionId}`);
  }

  private async sendCancellationNotification(sessionId: string, reason?: string): Promise<void> {
    // This would send a cancellation notification via Slack
    console.log(`Sending cancellation notification for session ${sessionId}, reason: ${reason || 'No reason provided'}`);
  }

  async close(): Promise<void> {
    await this.sessionService.close();
  }
}

export function createExecutionSessionIntegration(config: ExecutionSessionIntegrationConfig): ExecutionSessionIntegration {
  return new ExecutionSessionIntegration(config);
}