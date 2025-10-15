import { PlanGenerator } from './plan-generator.js';
import { LinearMCPClient } from './mcp/linear-client.js';
import { SlackMCPClient } from './mcp/slack-client.js';
import { ExecutionPlan, TeamSummary } from './mcp/types.js';
import { createExecutionPlanMessage, createTeamSummaryMessage } from './templates/slack-templates.js';
import * as cron from 'node-cron';
import * as moment from 'moment-timezone';
import * as sqlite3 from 'sqlite3';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { createLogger, LogLevel } from './monitoring/logger.js';

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
  retryCount?: number;
  lastRetryAt?: Date;
  nextRetryAt?: Date;
}

export interface ScheduleInfo {
  id: string;
  config: ScheduleConfig;
  isActive: boolean;
  nextExecution?: Date;
  lastExecution?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionStats {
  totalSessions: number;
  pendingSessions: number;
  confirmedSessions: number;
  completedSessions: number;
  failedSessions: number;
  retrySessions: number;
  averageExecutionTime: number;
  successRate: number;
}

export class EnhancedPlanScheduler {
  private linearClient: LinearMCPClient;
  private slackClient: SlackMCPClient;
  private planGenerator: PlanGenerator;
  private currentSchedule?: cron.ScheduledTask;
  private sessions: Map<string, ExecutionSession> = new Map();
  private db: sqlite3.Database;
  private dbPath: string;
  private retryQueue: Map<string, NodeJS.Timeout> = new Map();
  private maxRetries: number = 3;
  private retryDelayMs: number = 5000; // 5 seconds base delay
  private logger = createLogger();

  constructor(
    linearClient: LinearMCPClient,
    slackClient: SlackMCPClient,
    planGenerator: PlanGenerator,
    dbPath?: string
  ) {
    this.linearClient = linearClient;
    this.slackClient = slackClient;
    this.planGenerator = planGenerator;
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'scheduler.db');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.db = new sqlite3.Database(this.dbPath);
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      CREATE TABLE IF NOT EXISTS execution_sessions (
        id TEXT PRIMARY KEY,
        generated_at DATETIME,
        status TEXT,
        admin_user_id TEXT,
        team_id TEXT,
        plans TEXT,
        team_summary TEXT,
        message_ids TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        last_retry_at DATETIME,
        next_retry_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS schedule_configs (
        id TEXT PRIMARY KEY,
        config TEXT,
        is_active BOOLEAN DEFAULT 1,
        next_execution DATETIME,
        last_execution DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS execution_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        level TEXT,
        message TEXT,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES execution_sessions(id)
      )
    `);

    // Load existing sessions from database
    await this.loadSessionsFromDatabase();
  }

  private async loadSessionsFromDatabase(): Promise<void> {
    const all = promisify(this.db.all.bind(this.db));
    
    try {
      const sessions = await all(`
        SELECT * FROM execution_sessions 
        WHERE status IN ('pending', 'confirmed') 
        ORDER BY generated_at DESC
      `);

      for (const session of sessions) {
        const parsedSession: ExecutionSession = {
          id: session.id,
          generatedAt: new Date(session.generated_at),
          status: session.status,
          adminUserId: session.admin_user_id,
          teamId: session.team_id,
          plans: JSON.parse(session.plans || '[]'),
          teamSummary: session.team_summary ? JSON.parse(session.team_summary) : undefined,
          messageIds: JSON.parse(session.message_ids || '[]'),
          errorMessage: session.error_message,
          retryCount: session.retry_count || 0,
          lastRetryAt: session.last_retry_at ? new Date(session.last_retry_at) : undefined,
          nextRetryAt: session.next_retry_at ? new Date(session.next_retry_at) : undefined,
        };

        this.sessions.set(session.id, parsedSession);

        // Schedule retry if needed
        if (session.status === 'failed' && session.retry_count < this.maxRetries) {
          this.scheduleRetry(parsedSession);
        }
      }
    } catch (error) {
      console.error('Failed to load sessions from database:', error);
    }
  }

  async scheduleExecution(config: ScheduleConfig): Promise<string> {
    if (this.currentSchedule) {
      this.cancelScheduledExecution();
    }

    if (!config.enabled) {
      return '';
    }

    // Validate cron expression
    if (!cron.validate(config.cronExpression)) {
      throw new Error('Invalid cron expression');
    }

    // Validate timezone
    if (!moment.tz.zone(config.timezone)) {
      throw new Error(`Invalid timezone: ${config.timezone}`);
    }

    const scheduleId = this.generateScheduleId();
    
    // Save schedule configuration to database
    await this.saveScheduleConfig(scheduleId, config);

    // Calculate next execution time
    const nextExecution = this.calculateNextExecution(config.cronExpression, config.timezone);
    
    // Schedule the task
    this.currentSchedule = cron.schedule(config.cronExpression, () => {
      this.executeScheduledPlan(config);
    }, {
      scheduled: true,
      timezone: config.timezone
    });

    await this.updateScheduleNextExecution(scheduleId, nextExecution);

    this.logger.info(`Scheduled execution configured`, {
      scheduleId,
      cronExpression: config.cronExpression,
      timezone: config.timezone,
      nextExecution: nextExecution?.toISOString()
    });

    return scheduleId;
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
        messageIds: [],
        retryCount: 0
      };

      this.sessions.set(sessionId, session);
      await this.saveSessionToDatabase(session);

      this.log('info', `Starting manual execution`, { sessionId, adminUserId, teamId });

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
      await this.updateSessionInDatabase(session);

      this.log('info', `Manual execution completed successfully`, { 
        sessionId, 
        plansCount: session.plans.length,
        messageIdsCount: session.messageIds.length
      });

      return session;
    } catch (error) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'failed';
        session.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.updateSessionInDatabase(session);
      }

      this.log('error', `Manual execution failed`, { 
        sessionId, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw error;
    }
  }

  async cancelScheduledExecution(): Promise<void> {
    if (this.currentSchedule) {
      this.currentSchedule.stop();
      this.currentSchedule.destroy();
      this.currentSchedule = undefined;
      
      this.log('info', 'Scheduled execution cancelled');
    }
  }

  async getActiveSessions(): Promise<ExecutionSession[]> {
    return Array.from(this.sessions.values()).sort((a, b) => 
      b.generatedAt.getTime() - a.generatedAt.getTime()
    );
  }

  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  async updateSessionStatus(
    sessionId: string, 
    status: ExecutionSession['status'], 
    errorMessage?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      if (errorMessage) {
        session.errorMessage = errorMessage;
      }
      await this.updateSessionInDatabase(session);
    }
  }

  async retryFailedSession(sessionId: string): Promise<ExecutionSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'failed') {
      return null;
    }

    if (session.retryCount && session.retryCount >= this.maxRetries) {
      this.log('warn', `Session ${sessionId} has exceeded max retries`, { 
        retryCount: session.retryCount,
        maxRetries: this.maxRetries
      });
      return null;
    }

    // Clear previous retry timeout
    const existingTimeout = this.retryQueue.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.retryQueue.delete(sessionId);
    }

    // Calculate retry delay with exponential backoff
    const retryCount = session.retryCount || 0;
    const delay = this.retryDelayMs * Math.pow(2, retryCount);
    
    session.retryCount = retryCount + 1;
    session.lastRetryAt = new Date();
    session.nextRetryAt = new Date(Date.now() + delay);
    session.status = 'pending';
    session.errorMessage = undefined;

    await this.updateSessionInDatabase(session);

    this.log('info', `Scheduling retry for session ${sessionId}`, {
      retryCount: session.retryCount,
      delayMs: delay,
      nextRetryAt: session.nextRetryAt.toISOString()
    });

    // Schedule retry
    const timeout = setTimeout(async () => {
      try {
        await this.retrySessionExecution(session);
      } catch (error) {
        this.log('error', `Retry failed for session ${sessionId}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      this.retryQueue.delete(sessionId);
    }, delay);

    this.retryQueue.set(sessionId, timeout);
    return session;
  }

  private async retrySessionExecution(session: ExecutionSession): Promise<void> {
    try {
      this.log('info', `Retrying session execution`, { sessionId: session.id });

      // Regenerate plans
      const plans = await this.planGenerator.generateIndividualPlans(session.teamId);
      session.plans = plans;

      // Regenerate team summary if needed
      if (session.teamId) {
        const teamSummary = await this.planGenerator.generateTeamSummary(session.teamId);
        session.teamSummary = teamSummary;
      }

      // Send messages to Slack
      await this.sendPlansToSlack(session);

      session.status = 'confirmed';
      await this.updateSessionInDatabase(session);

      this.log('info', `Retry successful for session ${session.id}`, {
        plansCount: session.plans.length,
        messageIdsCount: session.messageIds.length
      });
    } catch (error) {
      session.status = 'failed';
      session.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateSessionInDatabase(session);

      // Schedule next retry if not exceeded max retries
      if ((session.retryCount || 0) < this.maxRetries) {
        await this.retryFailedSession(session.id);
      }

      throw error;
    }
  }

  private scheduleRetry(session: ExecutionSession): void {
    if (session.nextRetryAt && session.nextRetryAt > new Date()) {
      const delay = session.nextRetryAt.getTime() - Date.now();
      const timeout = setTimeout(async () => {
        try {
          await this.retrySessionExecution(session);
        } catch (error) {
          this.log('error', `Scheduled retry failed for session ${session.id}`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
        this.retryQueue.delete(session.id);
      }, delay);

      this.retryQueue.set(session.id, timeout);
    }
  }

  private async executeScheduledPlan(config: ScheduleConfig): Promise<void> {
    try {
      this.log('info', 'Executing scheduled plan generation', { config });
      
      const session = await this.triggerManualExecution(config.adminUserId, config.teamId);
      
      // Update last execution time
      await this.updateScheduleLastExecution(config);
      
      this.log('info', 'Scheduled plan generation completed successfully', {
        sessionId: session.id,
        plansCount: session.plans.length
      });
    } catch (error) {
      this.log('error', 'Scheduled plan generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async sendPlansToSlack(session: ExecutionSession): Promise<void> {
    await this.slackClient.connect();

    try {
      // Send individual plans to users
      for (const plan of session.plans) {
        try {
          const slackUserId = await this.getSlackUserId(plan.userId);
          
          if (slackUserId) {
            const message = createExecutionPlanMessage(plan, slackUserId);
            const messageId = await this.slackClient.sendExecutionPlanMessage(message);
            session.messageIds.push(messageId);
          }
        } catch (error) {
          this.log('error', `Failed to send plan to user ${plan.userName}`, {
            userId: plan.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
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
          this.log('error', 'Failed to send team summary', {
            teamId: session.teamSummary.teamId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } finally {
      await this.slackClient.disconnect();
    }
  }

  private async getSlackUserId(linearUserId: string): Promise<string | null> {
    try {
      const users = await this.slackClient.getUsers();
      // This is a simplified approach - you'd need proper user mapping logic
      return users[0]?.id || null;
    } catch (error) {
      this.log('error', 'Failed to get Slack user ID', {
        linearUserId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private async getSummaryChannelId(teamId: string): Promise<string | null> {
    try {
      const channels = await this.slackClient.getChannels();
      const summaryChannel = channels.find(channel => 
        channel.name.includes('summary') || 
        channel.name.includes('team') ||
        channel.name.includes('general')
      );
      return summaryChannel?.id || null;
    } catch (error) {
      this.log('error', 'Failed to get summary channel ID', {
        teamId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private calculateNextExecution(cronExpression: string, timezone: string): Date | null {
    try {
      // This is a simplified calculation
      // In production, you'd want to use a more sophisticated cron parser
      const now = moment.tz(timezone);
      const nextRun = now.clone().add(1, 'day'); // Simplified: next day
      return nextRun.toDate();
    } catch (error) {
      this.log('error', 'Failed to calculate next execution time', {
        cronExpression,
        timezone,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  private generateScheduleId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `schedule_${timestamp}_${random}`;
  }

  private async saveSessionToDatabase(session: ExecutionSession): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      INSERT OR REPLACE INTO execution_sessions (
        id, generated_at, status, admin_user_id, team_id, plans, 
        team_summary, message_ids, error_message, retry_count, 
        last_retry_at, next_retry_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      session.id,
      session.generatedAt.toISOString(),
      session.status,
      session.adminUserId,
      session.teamId || null,
      JSON.stringify(session.plans),
      session.teamSummary ? JSON.stringify(session.teamSummary) : null,
      JSON.stringify(session.messageIds),
      session.errorMessage || null,
      session.retryCount || 0,
      session.lastRetryAt?.toISOString() || null,
      session.nextRetryAt?.toISOString() || null
    ]);
  }

  private async updateSessionInDatabase(session: ExecutionSession): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      UPDATE execution_sessions SET
        status = ?, plans = ?, team_summary = ?, message_ids = ?, 
        error_message = ?, retry_count = ?, last_retry_at = ?, 
        next_retry_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      session.status,
      JSON.stringify(session.plans),
      session.teamSummary ? JSON.stringify(session.teamSummary) : null,
      JSON.stringify(session.messageIds),
      session.errorMessage || null,
      session.retryCount || 0,
      session.lastRetryAt?.toISOString() || null,
      session.nextRetryAt?.toISOString() || null,
      session.id
    ]);
  }

  private async saveScheduleConfig(scheduleId: string, config: ScheduleConfig): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      INSERT OR REPLACE INTO schedule_configs (
        id, config, is_active, next_execution, last_execution
      ) VALUES (?, ?, ?, ?, ?)
    `, [
      scheduleId,
      JSON.stringify(config),
      config.enabled ? 1 : 0,
      null, // Will be updated separately
      null
    ]);
  }

  private async updateScheduleNextExecution(scheduleId: string, nextExecution: Date | null): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      UPDATE schedule_configs SET
        next_execution = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      nextExecution?.toISOString() || null,
      scheduleId
    ]);
  }

  private async updateScheduleLastExecution(config: ScheduleConfig): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      UPDATE schedule_configs SET
        last_execution = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE config LIKE ?
    `, [`%${config.adminUserId}%`]);
  }

  private async log(level: string, message: string, details?: any): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    try {
      await run(`
        INSERT INTO execution_logs (level, message, details)
        VALUES (?, ?, ?)
      `, [level, message, JSON.stringify(details || {})]);
    } catch (error) {
      console.error('Failed to log to database:', error);
    }

    // Also log to console
    const logMessage = `[${level.toUpperCase()}] ${message}`;
    if (details) {
      console.log(logMessage, details);
    } else {
      console.log(logMessage);
    }
  }

  // Clean up old sessions and logs
  async cleanupOldData(maxAgeHours: number = 24): Promise<void> {
    const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    const run = promisify(this.db.run.bind(this.db));
    
    // Clean up old sessions
    await run(`
      DELETE FROM execution_sessions 
      WHERE generated_at < ? AND status IN ('completed', 'failed')
    `, [cutoffTime.toISOString()]);

    // Clean up old logs
    await run(`
      DELETE FROM execution_logs 
      WHERE timestamp < ?
    `, [cutoffTime.toISOString()]);

    // Clean up in-memory sessions
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.generatedAt < cutoffTime && 
          (session.status === 'completed' || session.status === 'failed')) {
        this.sessions.delete(sessionId);
      }
    }

    this.log('info', 'Cleaned up old data', { maxAgeHours, cutoffTime: cutoffTime.toISOString() });
  }

  // Get execution statistics
  getExecutionStats(): ExecutionStats {
    const sessions = Array.from(this.sessions.values());
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const totalExecutionTime = completedSessions.reduce((sum, s) => {
      // Simplified calculation - in production you'd track actual execution time
      return sum + 1000; // 1 second placeholder
    }, 0);

    return {
      totalSessions: sessions.length,
      pendingSessions: sessions.filter(s => s.status === 'pending').length,
      confirmedSessions: sessions.filter(s => s.status === 'confirmed').length,
      completedSessions: completedSessions.length,
      failedSessions: sessions.filter(s => s.status === 'failed').length,
      retrySessions: sessions.filter(s => (s.retryCount || 0) > 0).length,
      averageExecutionTime: completedSessions.length > 0 ? totalExecutionTime / completedSessions.length : 0,
      successRate: sessions.length > 0 ? (completedSessions.length / sessions.length) * 100 : 0
    };
  }

  // Get schedule information
  async getScheduleInfo(): Promise<ScheduleInfo | null> {
    const all = promisify(this.db.all.bind(this.db));
    
    try {
      const schedules = await all(`
        SELECT * FROM schedule_configs 
        WHERE is_active = 1 
        ORDER BY updated_at DESC 
        LIMIT 1
      `);

      if (schedules.length === 0) {
        return null;
      }

      const schedule = schedules[0];
      return {
        id: schedule.id,
        config: JSON.parse(schedule.config),
        isActive: Boolean(schedule.is_active),
        nextExecution: schedule.next_execution ? new Date(schedule.next_execution) : undefined,
        lastExecution: schedule.last_execution ? new Date(schedule.last_execution) : undefined,
        createdAt: new Date(schedule.created_at),
        updatedAt: new Date(schedule.updated_at)
      };
    } catch (error) {
      this.log('error', 'Failed to get schedule info', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    // Cancel scheduled execution
    await this.cancelScheduledExecution();

    // Clear retry timeouts
    for (const timeout of this.retryQueue.values()) {
      clearTimeout(timeout);
    }
    this.retryQueue.clear();

    // Close database connection
    const close = promisify(this.db.close.bind(this.db));
    await close();

    this.log('info', 'Scheduler shutdown completed');
  }
}

// Factory function to create an enhanced plan scheduler
export function createEnhancedPlanScheduler(
  linearClient: LinearMCPClient,
  slackClient: SlackMCPClient,
  planGenerator: PlanGenerator,
  dbPath?: string
): EnhancedPlanScheduler {
  return new EnhancedPlanScheduler(linearClient, slackClient, planGenerator, dbPath);
}