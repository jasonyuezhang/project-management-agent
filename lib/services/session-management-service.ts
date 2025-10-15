import { SessionDatabase, ExecutionSession, PlanModification, SessionStats } from '../database/session-database.js';
import { ExecutionPlan } from '../mcp/types.js';

export interface SessionManagementConfig {
  databasePath?: string;
  autoCleanupDays?: number;
}

export interface SessionCreationData {
  adminUserId: string;
  teamId: string;
  planCount?: number;
}

export interface ModificationData {
  sessionId: string;
  ticketId: string;
  userId: string;
  action: 'status_change' | 'reassign' | 'comment';
  value: string;
}

export interface SessionWithModifications extends ExecutionSession {
  modifications: PlanModification[];
}

export class SessionManagementService {
  private db: SessionDatabase;
  private config: SessionManagementConfig;

  constructor(config: SessionManagementConfig = {}) {
    this.config = {
      autoCleanupDays: 30,
      ...config
    };
    this.db = new SessionDatabase(config.databasePath);
  }

  async createExecutionSession(data: SessionCreationData): Promise<ExecutionSession> {
    const sessionId = this.generateSessionId();
    const now = new Date();

    const session: Omit<ExecutionSession, 'createdAt' | 'updatedAt'> = {
      id: sessionId,
      generatedAt: now,
      status: 'pending',
      adminUserId: data.adminUserId,
      teamId: data.teamId,
      planCount: data.planCount || 0
    };

    return await this.db.createSession(session);
  }

  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    return await this.db.getSession(sessionId);
  }

  async getSessionWithModifications(sessionId: string): Promise<SessionWithModifications | null> {
    const session = await this.db.getSession(sessionId);
    if (!session) return null;

    const modifications = await this.db.getModificationsBySession(sessionId);
    
    return {
      ...session,
      modifications
    };
  }

  async updateSessionStatus(sessionId: string, status: ExecutionSession['status']): Promise<boolean> {
    return await this.db.updateSessionStatus(sessionId, status);
  }

  async confirmSession(sessionId: string): Promise<boolean> {
    return await this.updateSessionStatus(sessionId, 'confirmed');
  }

  async completeSession(sessionId: string): Promise<boolean> {
    return await this.updateSessionStatus(sessionId, 'completed');
  }

  async cancelSession(sessionId: string): Promise<boolean> {
    return await this.updateSessionStatus(sessionId, 'cancelled');
  }

  async updateSessionPlanCount(sessionId: string, planCount: number): Promise<boolean> {
    return await this.db.updateSessionPlanCount(sessionId, planCount);
  }

  async addPlanModification(data: ModificationData): Promise<PlanModification> {
    const modificationId = this.generateModificationId();
    const now = new Date();

    const modification: Omit<PlanModification, 'processed' | 'error' | 'createdAt'> = {
      id: modificationId,
      sessionId: data.sessionId,
      ticketId: data.ticketId,
      userId: data.userId,
      action: data.action,
      value: data.value,
      timestamp: now
    };

    return await this.db.addPlanModification(modification);
  }

  async getSessionModifications(sessionId: string): Promise<PlanModification[]> {
    return await this.db.getModificationsBySession(sessionId);
  }

  async getTicketModifications(ticketId: string): Promise<PlanModification[]> {
    return await this.db.getModificationsByTicket(ticketId);
  }

  async getUnprocessedModifications(): Promise<PlanModification[]> {
    return await this.db.getUnprocessedModifications();
  }

  async markModificationProcessed(modificationId: string, error?: string): Promise<boolean> {
    return await this.db.markModificationProcessed(modificationId, error);
  }

  async processModifications(sessionId: string): Promise<{
    processed: number;
    errors: number;
    results: Array<{ modificationId: string; success: boolean; error?: string }>;
  }> {
    const modifications = await this.getSessionModifications(sessionId);
    const unprocessed = modifications.filter(m => !m.processed);
    
    const results: Array<{ modificationId: string; success: boolean; error?: string }> = [];
    let processed = 0;
    let errors = 0;

    for (const modification of unprocessed) {
      try {
        // Here you would integrate with your Linear updater
        // For now, we'll just mark as processed
        await this.markModificationProcessed(modification.id);
        results.push({ modificationId: modification.id, success: true });
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.markModificationProcessed(modification.id, errorMessage);
        results.push({ 
          modificationId: modification.id, 
          success: false, 
          error: errorMessage 
        });
        errors++;
      }
    }

    return { processed, errors, results };
  }

  async getSessionsByStatus(status: ExecutionSession['status']): Promise<ExecutionSession[]> {
    return await this.db.getSessionsByStatus(status);
  }

  async getSessionsByAdmin(adminUserId: string): Promise<ExecutionSession[]> {
    return await this.db.getSessionsByAdmin(adminUserId);
  }

  async getRecentSessions(limit: number = 10): Promise<ExecutionSession[]> {
    return await this.db.getRecentSessions(limit);
  }

  async getSessionStats(): Promise<SessionStats> {
    return await this.db.getSessionStats();
  }

  async getActiveSessions(): Promise<ExecutionSession[]> {
    const pending = await this.getSessionsByStatus('pending');
    const confirmed = await this.getSessionsByStatus('confirmed');
    return [...pending, ...confirmed];
  }

  async cleanupOldSessions(daysOld?: number): Promise<{ deletedSessions: number; deletedModifications: number }> {
    const days = daysOld || this.config.autoCleanupDays || 30;
    return await this.db.cleanupOldSessions(days);
  }

  async getSessionSummary(sessionId: string): Promise<{
    session: ExecutionSession;
    modificationCount: number;
    processedCount: number;
    errorCount: number;
    recentModifications: PlanModification[];
  } | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const modifications = await this.getSessionModifications(sessionId);
    const processedCount = modifications.filter(m => m.processed).length;
    const errorCount = modifications.filter(m => m.processed && m.error).length;
    const recentModifications = modifications
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);

    return {
      session,
      modificationCount: modifications.length,
      processedCount,
      errorCount,
      recentModifications
    };
  }

  async bulkCreateModifications(sessionId: string, modifications: Omit<ModificationData, 'sessionId'>[]): Promise<PlanModification[]> {
    const results: PlanModification[] = [];
    
    for (const modification of modifications) {
      const result = await this.addPlanModification({
        ...modification,
        sessionId
      });
      results.push(result);
    }

    return results;
  }

  async getModificationStats(sessionId: string): Promise<{
    total: number;
    byAction: Record<string, number>;
    byUser: Record<string, number>;
    processed: number;
    pending: number;
    errors: number;
  }> {
    const modifications = await this.getSessionModifications(sessionId);
    
    const byAction: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    let processed = 0;
    let pending = 0;
    let errors = 0;

    for (const modification of modifications) {
      byAction[modification.action] = (byAction[modification.action] || 0) + 1;
      byUser[modification.userId] = (byUser[modification.userId] || 0) + 1;
      
      if (modification.processed) {
        processed++;
        if (modification.error) errors++;
      } else {
        pending++;
      }
    }

    return {
      total: modifications.length,
      byAction,
      byUser,
      processed,
      pending,
      errors
    };
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
  }

  private generateModificationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `mod_${timestamp}_${random}`;
  }
}

export function createSessionManagementService(config?: SessionManagementConfig): SessionManagementService {
  return new SessionManagementService(config);
}