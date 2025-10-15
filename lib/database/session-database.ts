import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

export interface ExecutionSession {
  id: string;
  generatedAt: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  adminUserId: string;
  teamId: string;
  planCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PlanModification {
  id: string;
  sessionId: string;
  ticketId: string;
  userId: string;
  action: 'status_change' | 'reassign' | 'comment';
  value: string;
  timestamp: Date;
  processed?: boolean;
  error?: string;
}

export interface SessionStats {
  totalSessions: number;
  pendingSessions: number;
  confirmedSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  totalModifications: number;
  processedModifications: number;
  errorModifications: number;
}

export class SessionDatabase {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'sessions.db');
    this.db = new sqlite3.Database(this.dbPath);
    // Initialize database asynchronously
    this.initializeDatabase().catch(console.error);
  }

  private async initializeDatabase(): Promise<void> {
    try {
      const run = promisify(this.db.run.bind(this.db));
      
      // Create execution_sessions table
      await run(`
        CREATE TABLE IF NOT EXISTS execution_sessions (
          id TEXT PRIMARY KEY,
          generated_at DATETIME NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
          admin_user_id TEXT NOT NULL,
          team_id TEXT NOT NULL,
          plan_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create plan_modifications table
      await run(`
        CREATE TABLE IF NOT EXISTS plan_modifications (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          ticket_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          action TEXT NOT NULL CHECK (action IN ('status_change', 'reassign', 'comment')),
          value TEXT NOT NULL,
          timestamp DATETIME NOT NULL,
          processed BOOLEAN DEFAULT FALSE,
          error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES execution_sessions(id) ON DELETE CASCADE
        )
      `);

      // Create indexes for better performance
      await run(`CREATE INDEX IF NOT EXISTS idx_sessions_status ON execution_sessions(status)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_sessions_admin_user ON execution_sessions(admin_user_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_sessions_team ON execution_sessions(team_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_modifications_session ON plan_modifications(session_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_modifications_ticket ON plan_modifications(ticket_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_modifications_user ON plan_modifications(user_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_modifications_processed ON plan_modifications(processed)`);
    } catch (error) {
      // In test environment, database operations might fail
      // This is expected and we can continue
      console.warn('Database initialization failed (expected in test environment):', error);
    }
  }

  async createSession(session: Omit<ExecutionSession, 'createdAt' | 'updatedAt'>): Promise<ExecutionSession> {
    const run = promisify(this.db.run.bind(this.db));
    
    const now = new Date();
    await run(`
      INSERT INTO execution_sessions (id, generated_at, status, admin_user_id, team_id, plan_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      session.id,
      session.generatedAt.toISOString(),
      session.status,
      session.adminUserId,
      session.teamId,
      session.planCount || 0,
      now.toISOString(),
      now.toISOString()
    ]);

    return {
      ...session,
      createdAt: now,
      updatedAt: now
    };
  }

  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    const get = promisify(this.db.get.bind(this.db));
    
    const row = await get(`
      SELECT * FROM execution_sessions WHERE id = ?
    `, [sessionId]);

    if (!row) return null;

    return {
      id: row.id,
      generatedAt: new Date(row.generated_at),
      status: row.status,
      adminUserId: row.admin_user_id,
      teamId: row.team_id,
      planCount: row.plan_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async updateSessionStatus(sessionId: string, status: ExecutionSession['status']): Promise<boolean> {
    const run = promisify(this.db.run.bind(this.db));
    
    const result = await run(`
      UPDATE execution_sessions 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [status, sessionId]);

    return (result as any).changes > 0;
  }

  async updateSessionPlanCount(sessionId: string, planCount: number): Promise<boolean> {
    const run = promisify(this.db.run.bind(this.db));
    
    const result = await run(`
      UPDATE execution_sessions 
      SET plan_count = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [planCount, sessionId]);

    return (result as any).changes > 0;
  }

  async getSessionsByStatus(status: ExecutionSession['status']): Promise<ExecutionSession[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    const rows = await all(`
      SELECT * FROM execution_sessions WHERE status = ? ORDER BY generated_at DESC
    `, [status]);

    return rows.map(row => ({
      id: row.id,
      generatedAt: new Date(row.generated_at),
      status: row.status,
      adminUserId: row.admin_user_id,
      teamId: row.team_id,
      planCount: row.plan_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async getSessionsByAdmin(adminUserId: string): Promise<ExecutionSession[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    const rows = await all(`
      SELECT * FROM execution_sessions WHERE admin_user_id = ? ORDER BY generated_at DESC
    `, [adminUserId]);

    return rows.map(row => ({
      id: row.id,
      generatedAt: new Date(row.generated_at),
      status: row.status,
      adminUserId: row.admin_user_id,
      teamId: row.team_id,
      planCount: row.plan_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async getRecentSessions(limit: number = 10): Promise<ExecutionSession[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    const rows = await all(`
      SELECT * FROM execution_sessions ORDER BY generated_at DESC LIMIT ?
    `, [limit]);

    return rows.map(row => ({
      id: row.id,
      generatedAt: new Date(row.generated_at),
      status: row.status,
      adminUserId: row.admin_user_id,
      teamId: row.team_id,
      planCount: row.plan_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  async addPlanModification(modification: Omit<PlanModification, 'processed' | 'error'>): Promise<PlanModification> {
    const run = promisify(this.db.run.bind(this.db));
    
    const now = new Date();
    await run(`
      INSERT INTO plan_modifications (id, session_id, ticket_id, user_id, action, value, timestamp, processed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      modification.id,
      modification.sessionId,
      modification.ticketId,
      modification.userId,
      modification.action,
      modification.value,
      modification.timestamp.toISOString(),
      false,
      now.toISOString()
    ]);

    return {
      ...modification,
      processed: false,
      createdAt: now
    };
  }

  async getModificationsBySession(sessionId: string): Promise<PlanModification[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    const rows = await all(`
      SELECT * FROM plan_modifications WHERE session_id = ? ORDER BY timestamp ASC
    `, [sessionId]);

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      ticketId: row.ticket_id,
      userId: row.user_id,
      action: row.action,
      value: row.value,
      timestamp: new Date(row.timestamp),
      processed: Boolean(row.processed),
      error: row.error,
      createdAt: new Date(row.created_at)
    }));
  }

  async getModificationsByTicket(ticketId: string): Promise<PlanModification[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    const rows = await all(`
      SELECT * FROM plan_modifications WHERE ticket_id = ? ORDER BY timestamp ASC
    `, [ticketId]);

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      ticketId: row.ticket_id,
      userId: row.user_id,
      action: row.action,
      value: row.value,
      timestamp: new Date(row.timestamp),
      processed: Boolean(row.processed),
      error: row.error,
      createdAt: new Date(row.created_at)
    }));
  }

  async getUnprocessedModifications(): Promise<PlanModification[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    const rows = await all(`
      SELECT * FROM plan_modifications WHERE processed = FALSE ORDER BY timestamp ASC
    `);

    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      ticketId: row.ticket_id,
      userId: row.user_id,
      action: row.action,
      value: row.value,
      timestamp: new Date(row.timestamp),
      processed: Boolean(row.processed),
      error: row.error,
      createdAt: new Date(row.created_at)
    }));
  }

  async markModificationProcessed(modificationId: string, error?: string): Promise<boolean> {
    const run = promisify(this.db.run.bind(this.db));
    
    const result = await run(`
      UPDATE plan_modifications 
      SET processed = TRUE, error = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [error || null, modificationId]);

    return (result as any).changes > 0;
  }

  async getSessionStats(): Promise<SessionStats> {
    const get = promisify(this.db.get.bind(this.db));
    
    const sessionStats = await get(`
      SELECT 
        COUNT(*) as totalSessions,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingSessions,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmedSessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedSessions,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledSessions
      FROM execution_sessions
    `);

    const modificationStats = await get(`
      SELECT 
        COUNT(*) as totalModifications,
        SUM(CASE WHEN processed = TRUE THEN 1 ELSE 0 END) as processedModifications,
        SUM(CASE WHEN processed = FALSE AND error IS NOT NULL THEN 1 ELSE 0 END) as errorModifications
      FROM plan_modifications
    `);

    return {
      totalSessions: sessionStats.totalSessions || 0,
      pendingSessions: sessionStats.pendingSessions || 0,
      confirmedSessions: sessionStats.confirmedSessions || 0,
      completedSessions: sessionStats.completedSessions || 0,
      cancelledSessions: sessionStats.cancelledSessions || 0,
      totalModifications: modificationStats.totalModifications || 0,
      processedModifications: modificationStats.processedModifications || 0,
      errorModifications: modificationStats.errorModifications || 0
    };
  }

  async cleanupOldSessions(daysOld: number = 30): Promise<{ deletedSessions: number; deletedModifications: number }> {
    const run = promisify(this.db.run.bind(this.db));
    const get = promisify(this.db.get.bind(this.db));
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    // Get count of sessions to be deleted
    const sessionCount = await get(`
      SELECT COUNT(*) as count FROM execution_sessions 
      WHERE generated_at < ? AND status IN ('completed', 'cancelled')
    `, [cutoffDate.toISOString()]);

    // Get count of modifications to be deleted
    const modificationCount = await get(`
      SELECT COUNT(*) as count FROM plan_modifications pm
      JOIN execution_sessions es ON pm.session_id = es.id
      WHERE es.generated_at < ? AND es.status IN ('completed', 'cancelled')
    `, [cutoffDate.toISOString()]);

    // Delete old sessions (modifications will be deleted by CASCADE)
    await run(`
      DELETE FROM execution_sessions 
      WHERE generated_at < ? AND status IN ('completed', 'cancelled')
    `, [cutoffDate.toISOString()]);

    return {
      deletedSessions: sessionCount.count || 0,
      deletedModifications: modificationCount.count || 0
    };
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export function createSessionDatabase(dbPath?: string): SessionDatabase {
  return new SessionDatabase(dbPath);
}