import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';
import { promisify } from 'util';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

export interface LogEntry {
  id?: number;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: any;
  sessionId?: string;
  userId?: string;
  component: string;
  metadata?: Record<string, any>;
}

export interface LogQuery {
  level?: LogLevel;
  component?: string;
  sessionId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class Logger {
  private db: sqlite3.Database;
  private dbPath: string;
  private logDir: string;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB
  private maxFiles: number = 5;

  constructor(dbPath?: string, logDir?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'logs.db');
    this.logDir = logDir || path.join(process.cwd(), 'logs');
    
    // Ensure directories exist
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    this.db = new sqlite3.Database(this.dbPath);
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    await run(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME,
        level TEXT,
        message TEXT,
        details TEXT,
        session_id TEXT,
        user_id TEXT,
        component TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_logs_component ON logs(component);
    `);

    await run(`
      CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id);
    `);
  }

  async log(
    level: LogLevel,
    message: string,
    details?: any,
    options?: {
      sessionId?: string;
      userId?: string;
      component?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      details,
      sessionId: options?.sessionId,
      userId: options?.userId,
      component: options?.component || 'scheduler',
      metadata: options?.metadata
    };

    // Log to database
    await this.logToDatabase(entry);

    // Log to console
    this.logToConsole(entry);

    // Log to file
    await this.logToFile(entry);
  }

  private async logToDatabase(entry: LogEntry): Promise<void> {
    const run = promisify(this.db.run.bind(this.db));
    
    try {
      await run(`
        INSERT INTO logs (timestamp, level, message, details, session_id, user_id, component, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        entry.timestamp.toISOString(),
        entry.level,
        entry.message,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.sessionId || null,
        entry.userId || null,
        entry.component,
        entry.metadata ? JSON.stringify(entry.metadata) : null
      ]);
    } catch (error) {
      console.error('Failed to log to database:', error);
    }
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const component = `[${entry.component}]`.padEnd(15);
    const message = entry.message;
    const details = entry.details ? ` ${JSON.stringify(entry.details)}` : '';
    
    const logLine = `${timestamp} ${level} ${component} ${message}${details}`;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logLine);
        break;
      case LogLevel.INFO:
        console.info(logLine);
        break;
      case LogLevel.WARN:
        console.warn(logLine);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(logLine);
        break;
    }
  }

  private async logToFile(entry: LogEntry): Promise<void> {
    try {
      const date = entry.timestamp.toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `scheduler-${date}.log`);
      
      const logLine = JSON.stringify({
        timestamp: entry.timestamp.toISOString(),
        level: entry.level,
        component: entry.component,
        message: entry.message,
        details: entry.details,
        sessionId: entry.sessionId,
        userId: entry.userId,
        metadata: entry.metadata
      }) + '\n';
      
      fs.appendFileSync(logFile, logLine);
      
      // Rotate log files if they get too large
      await this.rotateLogFiles(logFile);
    } catch (error) {
      console.error('Failed to log to file:', error);
    }
  }

  private async rotateLogFiles(currentLogFile: string): Promise<void> {
    try {
      const stats = fs.statSync(currentLogFile);
      if (stats.size > this.maxFileSize) {
        // Rotate the current log file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = currentLogFile.replace('.log', `-${timestamp}.log`);
        fs.renameSync(currentLogFile, rotatedFile);
        
        // Clean up old log files
        const logFiles = fs.readdirSync(this.logDir)
          .filter(file => file.startsWith('scheduler-') && file.endsWith('.log'))
          .map(file => ({
            name: file,
            path: path.join(this.logDir, file),
            mtime: fs.statSync(path.join(this.logDir, file)).mtime
          }))
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        
        // Keep only the most recent files
        if (logFiles.length > this.maxFiles) {
          const filesToDelete = logFiles.slice(this.maxFiles);
          for (const file of filesToDelete) {
            fs.unlinkSync(file.path);
          }
        }
      }
    } catch (error) {
      console.error('Failed to rotate log files:', error);
    }
  }

  async queryLogs(query: LogQuery): Promise<LogEntry[]> {
    const all = promisify(this.db.all.bind(this.db));
    
    let sql = 'SELECT * FROM logs WHERE 1=1';
    const params: any[] = [];
    
    if (query.level) {
      sql += ' AND level = ?';
      params.push(query.level);
    }
    
    if (query.component) {
      sql += ' AND component = ?';
      params.push(query.component);
    }
    
    if (query.sessionId) {
      sql += ' AND session_id = ?';
      params.push(query.sessionId);
    }
    
    if (query.userId) {
      sql += ' AND user_id = ?';
      params.push(query.userId);
    }
    
    if (query.startDate) {
      sql += ' AND timestamp >= ?';
      params.push(query.startDate.toISOString());
    }
    
    if (query.endDate) {
      sql += ' AND timestamp <= ?';
      params.push(query.endDate.toISOString());
    }
    
    sql += ' ORDER BY timestamp DESC';
    
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }
    
    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }
    
    try {
      const rows = await all(sql, params);
      return rows.map(row => ({
        id: row.id,
        timestamp: new Date(row.timestamp),
        level: row.level as LogLevel,
        message: row.message,
        details: row.details ? JSON.parse(row.details) : undefined,
        sessionId: row.session_id,
        userId: row.user_id,
        component: row.component,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined
      }));
    } catch (error) {
      console.error('Failed to query logs:', error);
      return [];
    }
  }

  async getLogStats(timeRange: { start: Date; end: Date }): Promise<{
    totalLogs: number;
    byLevel: Record<LogLevel, number>;
    byComponent: Record<string, number>;
    errorRate: number;
    topErrors: Array<{ message: string; count: number }>;
  }> {
    const all = promisify(this.db.all.bind(this.db));
    
    try {
      // Total logs
      const totalResult = await all(`
        SELECT COUNT(*) as count FROM logs 
        WHERE timestamp >= ? AND timestamp <= ?
      `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);
      
      const totalLogs = totalResult[0].count;
      
      // By level
      const levelResult = await all(`
        SELECT level, COUNT(*) as count FROM logs 
        WHERE timestamp >= ? AND timestamp <= ?
        GROUP BY level
      `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);
      
      const byLevel: Record<LogLevel, number> = {
        [LogLevel.DEBUG]: 0,
        [LogLevel.INFO]: 0,
        [LogLevel.WARN]: 0,
        [LogLevel.ERROR]: 0,
        [LogLevel.FATAL]: 0
      };
      
      for (const row of levelResult) {
        byLevel[row.level as LogLevel] = row.count;
      }
      
      // By component
      const componentResult = await all(`
        SELECT component, COUNT(*) as count FROM logs 
        WHERE timestamp >= ? AND timestamp <= ?
        GROUP BY component
        ORDER BY count DESC
      `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);
      
      const byComponent: Record<string, number> = {};
      for (const row of componentResult) {
        byComponent[row.component] = row.count;
      }
      
      // Error rate
      const errorCount = byLevel[LogLevel.ERROR] + byLevel[LogLevel.FATAL];
      const errorRate = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;
      
      // Top errors
      const topErrorsResult = await all(`
        SELECT message, COUNT(*) as count FROM logs 
        WHERE timestamp >= ? AND timestamp <= ? AND level IN ('error', 'fatal')
        GROUP BY message
        ORDER BY count DESC
        LIMIT 10
      `, [timeRange.start.toISOString(), timeRange.end.toISOString()]);
      
      const topErrors = topErrorsResult.map(row => ({
        message: row.message,
        count: row.count
      }));
      
      return {
        totalLogs,
        byLevel,
        byComponent,
        errorRate,
        topErrors
      };
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return {
        totalLogs: 0,
        byLevel: {
          [LogLevel.DEBUG]: 0,
          [LogLevel.INFO]: 0,
          [LogLevel.WARN]: 0,
          [LogLevel.ERROR]: 0,
          [LogLevel.FATAL]: 0
        },
        byComponent: {},
        errorRate: 0,
        topErrors: []
      };
    }
  }

  async cleanupOldLogs(maxAgeDays: number = 30): Promise<number> {
    const run = promisify(this.db.run.bind(this.db));
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    
    try {
      const result = await run(`
        DELETE FROM logs WHERE timestamp < ?
      `, [cutoffDate.toISOString()]);
      
      return result.changes || 0;
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
      return 0;
    }
  }

  // Convenience methods
  async debug(message: string, details?: any, options?: any): Promise<void> {
    await this.log(LogLevel.DEBUG, message, details, options);
  }

  async info(message: string, details?: any, options?: any): Promise<void> {
    await this.log(LogLevel.INFO, message, details, options);
  }

  async warn(message: string, details?: any, options?: any): Promise<void> {
    await this.log(LogLevel.WARN, message, details, options);
  }

  async error(message: string, details?: any, options?: any): Promise<void> {
    await this.log(LogLevel.ERROR, message, details, options);
  }

  async fatal(message: string, details?: any, options?: any): Promise<void> {
    await this.log(LogLevel.FATAL, message, details, options);
  }

  async shutdown(): Promise<void> {
    const close = promisify(this.db.close.bind(this.db));
    await close();
  }
}

// Factory function
export function createLogger(dbPath?: string, logDir?: string): Logger {
  return new Logger(dbPath, logDir);
}

// Global logger instance
export const logger = createLogger();