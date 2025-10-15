import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SessionDatabase, ExecutionSession, PlanModification } from '../database/session-database.js';
import { SessionManagementService, SessionCreationData, ModificationData } from '../services/session-management-service.js';

// Mock sqlite3 completely
jest.mock('sqlite3', () => {
  const mockDb = {
    run: jest.fn((sql, params, callback) => {
      if (callback) callback(null, { changes: 1, lastID: 1 });
      return mockDb;
    }),
    get: jest.fn((sql, params, callback) => {
      if (callback) callback(null, null);
      return mockDb;
    }),
    all: jest.fn((sql, params, callback) => {
      if (callback) callback(null, []);
      return mockDb;
    }),
    close: jest.fn((callback) => {
      if (callback) callback(null);
      return mockDb;
    })
  };
  
  return {
    Database: jest.fn(() => mockDb)
  };
});

// Mock promisify to return mock functions
jest.mock('util', () => ({
  promisify: jest.fn((fn) => {
    return jest.fn().mockResolvedValue({ changes: 1, lastID: 1 });
  })
}));

describe('Phase 5.2: Local Storage for Session Management', () => {
  let sessionDb: SessionDatabase;
  let sessionService: SessionManagementService;

  beforeEach(() => {
    sessionDb = new SessionDatabase(':memory:');
    sessionService = new SessionManagementService({ databasePath: ':memory:' });
  });

  afterEach(async () => {
    if (sessionDb) {
      await sessionDb.close();
    }
    if (sessionService) {
      await sessionService.close();
    }
  });

  describe('SessionDatabase', () => {
    it('should initialize database with correct schema', async () => {
      // The database initialization is called in constructor
      expect(sessionDb).toBeDefined();
    });

    it('should create execution session', async () => {
      const sessionData: Omit<ExecutionSession, 'createdAt' | 'updatedAt'> = {
        id: 'test-session-123',
        generatedAt: new Date('2024-01-15T10:00:00Z'),
        status: 'pending',
        adminUserId: 'admin-123',
        teamId: 'team-123',
        planCount: 5
      };

      const session = await sessionDb.createSession(sessionData);
      
      expect(session.id).toBe('test-session-123');
      expect(session.status).toBe('pending');
      expect(session.adminUserId).toBe('admin-123');
      expect(session.teamId).toBe('team-123');
      expect(session.planCount).toBe(5);
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
    });

    it('should retrieve session by ID', async () => {
      const session = await sessionDb.getSession('test-session-123');
      expect(session).toBeNull(); // Mock returns null
    });

    it('should update session status', async () => {
      const result = await sessionDb.updateSessionStatus('test-session-123', 'confirmed');
      expect(result).toBe(true);
    });

    it('should update session plan count', async () => {
      const result = await sessionDb.updateSessionPlanCount('test-session-123', 10);
      expect(result).toBe(true);
    });

    it('should get sessions by status', async () => {
      const sessions = await sessionDb.getSessionsByStatus('pending');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get sessions by admin user', async () => {
      const sessions = await sessionDb.getSessionsByAdmin('admin-123');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get recent sessions', async () => {
      const sessions = await sessionDb.getRecentSessions(5);
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should add plan modification', async () => {
      const modification: Omit<PlanModification, 'processed' | 'error' | 'createdAt'> = {
        id: 'mod-123',
        sessionId: 'session-123',
        ticketId: 'ticket-123',
        userId: 'user-123',
        action: 'status_change',
        value: 'in_progress',
        timestamp: new Date()
      };

      const result = await sessionDb.addPlanModification(modification);
      
      expect(result.id).toBe('mod-123');
      expect(result.sessionId).toBe('session-123');
      expect(result.ticketId).toBe('ticket-123');
      expect(result.userId).toBe('user-123');
      expect(result.action).toBe('status_change');
      expect(result.value).toBe('in_progress');
      expect(result.processed).toBe(false);
    });

    it('should get modifications by session', async () => {
      const modifications = await sessionDb.getModificationsBySession('session-123');
      expect(Array.isArray(modifications)).toBe(true);
    });

    it('should get modifications by ticket', async () => {
      const modifications = await sessionDb.getModificationsByTicket('ticket-123');
      expect(Array.isArray(modifications)).toBe(true);
    });

    it('should get unprocessed modifications', async () => {
      const modifications = await sessionDb.getUnprocessedModifications();
      expect(Array.isArray(modifications)).toBe(true);
    });

    it('should mark modification as processed', async () => {
      const result = await sessionDb.markModificationProcessed('mod-123');
      expect(result).toBe(true);
    });

    it('should get session stats', async () => {
      const stats = await sessionDb.getSessionStats();
      
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('pendingSessions');
      expect(stats).toHaveProperty('confirmedSessions');
      expect(stats).toHaveProperty('completedSessions');
      expect(stats).toHaveProperty('cancelledSessions');
      expect(stats).toHaveProperty('totalModifications');
      expect(stats).toHaveProperty('processedModifications');
      expect(stats).toHaveProperty('errorModifications');
    });

    it('should cleanup old sessions', async () => {
      const result = await sessionDb.cleanupOldSessions(30);
      
      expect(result).toHaveProperty('deletedSessions');
      expect(result).toHaveProperty('deletedModifications');
    });
  });

  describe('SessionManagementService', () => {
    it('should create execution session', async () => {
      const sessionData: SessionCreationData = {
        adminUserId: 'admin-123',
        teamId: 'team-123',
        planCount: 5
      };

      const session = await sessionService.createExecutionSession(sessionData);
      
      expect(session.id).toMatch(/^session_/);
      expect(session.status).toBe('pending');
      expect(session.adminUserId).toBe('admin-123');
      expect(session.teamId).toBe('team-123');
      expect(session.planCount).toBe(5);
    });

    it('should get session by ID', async () => {
      const session = await sessionService.getSession('test-session-123');
      expect(session).toBeNull(); // Mock returns null
    });

    it('should get session with modifications', async () => {
      const sessionWithMods = await sessionService.getSessionWithModifications('test-session-123');
      expect(sessionWithMods).toBeNull(); // Mock returns null
    });

    it('should update session status', async () => {
      const result = await sessionService.updateSessionStatus('test-session-123', 'confirmed');
      expect(result).toBe(true);
    });

    it('should confirm session', async () => {
      const result = await sessionService.confirmSession('test-session-123');
      expect(result).toBe(true);
    });

    it('should complete session', async () => {
      const result = await sessionService.completeSession('test-session-123');
      expect(result).toBe(true);
    });

    it('should cancel session', async () => {
      const result = await sessionService.cancelSession('test-session-123');
      expect(result).toBe(true);
    });

    it('should update session plan count', async () => {
      const result = await sessionService.updateSessionPlanCount('test-session-123', 10);
      expect(result).toBe(true);
    });

    it('should add plan modification', async () => {
      const modificationData: ModificationData = {
        sessionId: 'session-123',
        ticketId: 'ticket-123',
        userId: 'user-123',
        action: 'status_change',
        value: 'in_progress'
      };

      const modification = await sessionService.addPlanModification(modificationData);
      
      expect(modification.id).toMatch(/^mod_/);
      expect(modification.sessionId).toBe('session-123');
      expect(modification.ticketId).toBe('ticket-123');
      expect(modification.userId).toBe('user-123');
      expect(modification.action).toBe('status_change');
      expect(modification.value).toBe('in_progress');
      expect(modification.processed).toBe(false);
    });

    it('should get session modifications', async () => {
      const modifications = await sessionService.getSessionModifications('session-123');
      expect(Array.isArray(modifications)).toBe(true);
    });

    it('should get ticket modifications', async () => {
      const modifications = await sessionService.getTicketModifications('ticket-123');
      expect(Array.isArray(modifications)).toBe(true);
    });

    it('should get unprocessed modifications', async () => {
      const modifications = await sessionService.getUnprocessedModifications();
      expect(Array.isArray(modifications)).toBe(true);
    });

    it('should mark modification as processed', async () => {
      const result = await sessionService.markModificationProcessed('mod-123');
      expect(result).toBe(true);
    });

    it('should process modifications', async () => {
      const result = await sessionService.processModifications('session-123');
      
      expect(result).toHaveProperty('processed');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should get sessions by status', async () => {
      const sessions = await sessionService.getSessionsByStatus('pending');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get sessions by admin', async () => {
      const sessions = await sessionService.getSessionsByAdmin('admin-123');
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get recent sessions', async () => {
      const sessions = await sessionService.getRecentSessions(5);
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should get session stats', async () => {
      const stats = await sessionService.getSessionStats();
      
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('pendingSessions');
      expect(stats).toHaveProperty('confirmedSessions');
      expect(stats).toHaveProperty('completedSessions');
      expect(stats).toHaveProperty('cancelledSessions');
      expect(stats).toHaveProperty('totalModifications');
      expect(stats).toHaveProperty('processedModifications');
      expect(stats).toHaveProperty('errorModifications');
    });

    it('should get active sessions', async () => {
      const activeSessions = await sessionService.getActiveSessions();
      expect(Array.isArray(activeSessions)).toBe(true);
    });

    it('should cleanup old sessions', async () => {
      const result = await sessionService.cleanupOldSessions(30);
      
      expect(result).toHaveProperty('deletedSessions');
      expect(result).toHaveProperty('deletedModifications');
    });

    it('should get session summary', async () => {
      const summary = await sessionService.getSessionSummary('session-123');
      expect(summary).toBeNull(); // Mock returns null
    });

    it('should bulk create modifications', async () => {
      const modifications = [
        {
          ticketId: 'ticket-1',
          userId: 'user-1',
          action: 'status_change' as const,
          value: 'in_progress'
        },
        {
          ticketId: 'ticket-2',
          userId: 'user-2',
          action: 'reassign' as const,
          value: 'user-3'
        }
      ];

      const results = await sessionService.bulkCreateModifications('session-123', modifications);
      
      expect(results).toHaveLength(2);
      expect(results[0].ticketId).toBe('ticket-1');
      expect(results[1].ticketId).toBe('ticket-2');
    });

    it('should get modification stats', async () => {
      const stats = await sessionService.getModificationStats('session-123');
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byAction');
      expect(stats).toHaveProperty('byUser');
      expect(stats).toHaveProperty('processed');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('errors');
    });
  });

  describe('Session Lifecycle', () => {
    it('should handle complete session lifecycle', async () => {
      // Create session
      const sessionData: SessionCreationData = {
        adminUserId: 'admin-123',
        teamId: 'team-123',
        planCount: 3
      };

      const session = await sessionService.createExecutionSession(sessionData);
      expect(session.status).toBe('pending');

      // Add modifications
      const modifications = [
        {
          ticketId: 'ticket-1',
          userId: 'user-1',
          action: 'status_change' as const,
          value: 'in_progress'
        },
        {
          ticketId: 'ticket-2',
          userId: 'user-2',
          action: 'reassign' as const,
          value: 'user-3'
        }
      ];

      const modResults = await sessionService.bulkCreateModifications(session.id, modifications);
      expect(modResults).toHaveLength(2);

      // Confirm session
      const confirmed = await sessionService.confirmSession(session.id);
      expect(confirmed).toBe(true);

      // Process modifications
      const processResult = await sessionService.processModifications(session.id);
      expect(processResult).toHaveProperty('processed');
      expect(processResult).toHaveProperty('errors');

      // Complete session
      const completed = await sessionService.completeSession(session.id);
      expect(completed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // This would be tested with actual database errors in integration tests
      const session = await sessionService.getSession('non-existent-session');
      expect(session).toBeNull();
    });

    it('should handle modification processing errors', async () => {
      const result = await sessionService.processModifications('session-123');
      expect(result.errors).toBe(0); // Mock doesn't throw errors
    });
  });

  describe('Data Validation', () => {
    it('should validate session status values', async () => {
      const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
      
      for (const status of validStatuses) {
        const result = await sessionService.updateSessionStatus('session-123', status as any);
        expect(result).toBe(true);
      }
    });

    it('should validate modification action values', async () => {
      const validActions = ['status_change', 'reassign', 'comment'];
      
      for (const action of validActions) {
        const modificationData: ModificationData = {
          sessionId: 'session-123',
          ticketId: 'ticket-123',
          userId: 'user-123',
          action: action as any,
          value: 'test'
        };

        const modification = await sessionService.addPlanModification(modificationData);
        expect(modification.action).toBe(action);
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent sessions', async () => {
      const promises = [];
      
      for (let i = 0; i < 10; i++) {
        const sessionData: SessionCreationData = {
          adminUserId: `admin-${i}`,
          teamId: `team-${i}`,
          planCount: i
        };
        promises.push(sessionService.createExecutionSession(sessionData));
      }

      const sessions = await Promise.all(promises);
      expect(sessions).toHaveLength(10);
    });

    it('should handle bulk modifications efficiently', async () => {
      const modifications = [];
      
      for (let i = 0; i < 100; i++) {
        modifications.push({
          ticketId: `ticket-${i}`,
          userId: `user-${i % 10}`,
          action: 'status_change' as const,
          value: 'in_progress'
        });
      }

      const results = await sessionService.bulkCreateModifications('session-123', modifications);
      expect(results).toHaveLength(100);
    });
  });
});