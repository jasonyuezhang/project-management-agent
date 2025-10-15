import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { LinearUpdater, createLinearUpdater, UpdateResult, BatchUpdateResult } from '../updaters/linear-updater.js';
import { LinearMCPClient } from '../mcp/linear-client.js';
import { PlanModification, ExecutionPlan, LinearIssue, LinearUser } from '../mcp/types.js';

// Mock the logger
jest.mock('../monitoring/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Phase 4.1: Linear Update Orchestrator', () => {
  let mockLinearClient: jest.Mocked<LinearMCPClient>;
  let linearUpdater: LinearUpdater;
  let mockTickets: LinearIssue[];
  let mockUsers: LinearUser[];

  beforeEach(() => {
    // Create mock Linear client
    mockLinearClient = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      getTicketsByStatus: jest.fn(),
      getTicketsByAssignee: jest.fn(),
      getTicketsByFilter: jest.fn(),
      updateTicketStatus: jest.fn(),
      updateTicketAssignee: jest.fn(),
      addTicketComment: jest.fn(),
      createCustomField: jest.fn(),
      getUsers: jest.fn(),
      getTeams: jest.fn(),
      getTicketById: jest.fn(),
      generateExecutionPlans: jest.fn(),
      generateTeamSummary: jest.fn(),
    } as jest.Mocked<LinearMCPClient>;

    // Create LinearUpdater instance
    linearUpdater = createLinearUpdater(mockLinearClient, {
      retryAttempts: 2,
      retryDelay: 100,
      validateBeforeUpdate: true,
      dryRun: false,
      batchSize: 5,
    });

    // Mock data
    mockTickets = [
      {
        id: 'ticket-1',
        identifier: 'PROJ-123',
        title: 'Test ticket 1',
        description: 'Test description 1',
        state: { id: 'state-1', name: 'Todo', type: 'unstarted' as const, color: '#000', position: 1 },
        priority: 1,
        assignee: { id: 'user-1', name: 'test', email: 'test@example.com', displayName: 'Test User', avatarUrl: '' },
        creator: { id: 'user-1', name: 'test', email: 'test@example.com', displayName: 'Test User', avatarUrl: '' },
        team: { id: 'team-1', name: 'Test Team', key: 'TEST' },
        labels: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: 'https://example.com'
      },
      {
        id: 'ticket-2',
        identifier: 'PROJ-456',
        title: 'Test ticket 2',
        description: 'Test description 2',
        state: { id: 'state-2', name: 'In Progress', type: 'started' as const, color: '#000', position: 2 },
        priority: 2,
        assignee: { id: 'user-2', name: 'john', email: 'john.doe@example.com', displayName: 'John Doe', avatarUrl: '' },
        creator: { id: 'user-1', name: 'test', email: 'test@example.com', displayName: 'Test User', avatarUrl: '' },
        team: { id: 'team-1', name: 'Test Team', key: 'TEST' },
        labels: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: 'https://example.com'
      }
    ];

    mockUsers = [
      {
        id: 'user-1',
        name: 'test',
        email: 'test@example.com',
        displayName: 'Test User',
        avatarUrl: ''
      },
      {
        id: 'user-2',
        name: 'john',
        email: 'john.doe@example.com',
        displayName: 'John Doe',
        avatarUrl: ''
      },
      {
        id: 'user-3',
        name: 'jane',
        email: 'jane.doe@example.com',
        displayName: 'Jane Doe',
        avatarUrl: ''
      }
    ];

    // Setup default mock implementations
    mockLinearClient.getTicketById.mockImplementation((id) => {
      if (id === 'ticket-1') return Promise.resolve(mockTickets[0]);
      if (id === 'ticket-2') return Promise.resolve(mockTickets[1]);
      return Promise.resolve(null);
    });
    mockLinearClient.getTicketsByFilter.mockResolvedValue(mockTickets);
    mockLinearClient.getUsers.mockResolvedValue(mockUsers);
    mockLinearClient.updateTicketStatus.mockResolvedValue();
    mockLinearClient.updateTicketAssignee.mockResolvedValue();
    mockLinearClient.addTicketComment.mockResolvedValue();
  });

  describe('Single Modification Application', () => {
    it('should successfully apply status change modification', async () => {
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'status_change',
        value: 'in-progress',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Move PROJ-123 to in-progress'
      };

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe('PROJ-123');
      expect(result.action).toBe('status_change');
      expect(result.error).toBeUndefined();
      expect(mockLinearClient.updateTicketStatus).toHaveBeenCalledWith('ticket-1', 'started');
    });

    it('should successfully apply reassignment modification', async () => {
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'reassign',
        value: 'jane.doe@example.com',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Reassign PROJ-123 to jane.doe@example.com'
      };

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe('PROJ-123');
      expect(result.action).toBe('reassign');
      expect(mockLinearClient.updateTicketAssignee).toHaveBeenCalledWith('ticket-1', 'user-3');
    });

    it('should successfully apply comment modification', async () => {
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'comment',
        value: 'Starting work on this ticket',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Add comment to PROJ-123: Starting work on this ticket'
      };

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(true);
      expect(result.ticketId).toBe('PROJ-123');
      expect(result.action).toBe('comment');
      expect(mockLinearClient.addTicketComment).toHaveBeenCalledWith('ticket-1', 'Starting work on this ticket');
    });

    it('should handle dry run mode', async () => {
      const dryRunUpdater = createLinearUpdater(mockLinearClient, { dryRun: true });
      
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'status_change',
        value: 'in-progress',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Move PROJ-123 to in-progress'
      };

      const result = await dryRunUpdater.applyModification(modification);

      expect(result.success).toBe(true);
      expect(mockLinearClient.updateTicketStatus).not.toHaveBeenCalled();
    });

    it('should handle validation errors', async () => {
      mockLinearClient.getTicketById.mockResolvedValue(null);

      const modification: PlanModification = {
        ticketId: 'INVALID-123',
        action: 'status_change',
        value: 'in-progress',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Move INVALID-123 to in-progress'
      };

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle invalid status values', async () => {
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'status_change',
        value: 'invalid-status',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Move PROJ-123 to invalid-status'
      };

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid status');
    });

    it('should handle user not found for reassignment', async () => {
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'reassign',
        value: 'nonexistent@example.com',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Reassign PROJ-123 to nonexistent@example.com'
      };

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });

    it('should handle empty comment validation', async () => {
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'comment',
        value: '',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Add comment to PROJ-123: '
      };

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Comment cannot be empty');
    });
  });

  describe('Batch Modification Processing', () => {
    it('should successfully process multiple modifications', async () => {
      const modifications: PlanModification[] = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change',
          value: 'in-progress',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to in-progress'
        },
        {
          ticketId: 'PROJ-456',
          action: 'reassign',
          value: 'jane.doe@example.com',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Reassign PROJ-456 to jane.doe@example.com'
        },
        {
          ticketId: 'PROJ-123',
          action: 'comment',
          value: 'Starting work',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Add comment to PROJ-123: Starting work'
        }
      ];

      // Mock getTicketById for both tickets - need to map PROJ-123 to ticket-1 and PROJ-456 to ticket-2
      mockLinearClient.getTicketById.mockImplementation((ticketId) => {
        if (ticketId === 'ticket-1') return Promise.resolve(mockTickets[0]);
        if (ticketId === 'ticket-2') return Promise.resolve(mockTickets[1]);
        return Promise.resolve(null);
      });

      const result = await linearUpdater.applyModifications(modifications, 'session-123');

      expect(result.sessionId).toBe('session-123');
      expect(result.totalModifications).toBe(3);
      expect(result.successfulUpdates).toBe(3);
      expect(result.failedUpdates).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mixed success and failure in batch processing', async () => {
      const modifications: PlanModification[] = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change',
          value: 'in-progress',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to in-progress'
        },
        {
          ticketId: 'INVALID-123',
          action: 'status_change',
          value: 'in-progress',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move INVALID-123 to in-progress'
        }
      ];

      // Mock getTicketById to return null for invalid ticket
      mockLinearClient.getTicketById.mockImplementation((ticketId) => {
        if (ticketId === 'ticket-1') return Promise.resolve(mockTickets[0]);
        return Promise.resolve(null);
      });

      const result = await linearUpdater.applyModifications(modifications, 'session-123');

      expect(result.totalModifications).toBe(2);
      expect(result.successfulUpdates).toBe(1);
      expect(result.failedUpdates).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should process modifications in batches when batch size is smaller than total', async () => {
      const modifications: PlanModification[] = Array.from({ length: 7 }, (_, i) => ({
        ticketId: `PROJ-${i + 1}`,
        action: 'status_change' as const,
        value: 'in-progress',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: `Move PROJ-${i + 1} to in-progress`
      }));

      // Mock getTicketById to return a valid ticket for all
      mockLinearClient.getTicketById.mockResolvedValue(mockTickets[0]);

      const result = await linearUpdater.applyModifications(modifications, 'session-123');

      expect(result.totalModifications).toBe(7);
      expect(result.successfulUpdates).toBe(7);
      expect(result.failedUpdates).toBe(0);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed operations in batch processing', async () => {
      const modifications: PlanModification[] = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change',
          value: 'in-progress',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to in-progress'
        }
      ];

      // Mock updateTicketStatus to fail first, then succeed
      mockLinearClient.updateTicketStatus
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      const result = await linearUpdater.applyModifications(modifications, 'session-123');

      expect(result.successfulUpdates).toBe(1);
      expect(result.failedUpdates).toBe(0);
      expect(mockLinearClient.updateTicketStatus).toHaveBeenCalledTimes(2);
    });

    it('should fail after all retry attempts in batch processing', async () => {
      const modifications: PlanModification[] = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change',
          value: 'in-progress',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to in-progress'
        }
      ];

      // Mock updateTicketStatus to always fail
      mockLinearClient.updateTicketStatus.mockRejectedValue(new Error('Persistent error'));

      const result = await linearUpdater.applyModifications(modifications, 'session-123');

      expect(result.successfulUpdates).toBe(0);
      expect(result.failedUpdates).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(mockLinearClient.updateTicketStatus).toHaveBeenCalledTimes(2); // retryAttempts = 2
    });
  });

  describe('Execution Plan Comments', () => {
    it('should create execution plan comment', async () => {
      const plan: ExecutionPlan = {
        userId: 'user-123',
        userName: 'Test User',
        tickets: {
          finished: [mockTickets[0]],
          inProgress: [mockTickets[1]],
          open: []
        },
        summary: 'Test summary',
        generatedAt: new Date(),
        planId: 'plan-123'
      };

      await linearUpdater.createExecutionPlanComment('ticket-1', plan);

      expect(mockLinearClient.addTicketComment).toHaveBeenCalledWith(
        'ticket-1',
        expect.stringContaining('Execution Plan')
      );
    });
  });

  describe('Status Mapping', () => {
    it('should map user-friendly status names to Linear statuses', async () => {
      const testCases = [
        { input: 'in-progress', expected: 'started' },
        { input: 'in progress', expected: 'started' },
        { input: 'todo', expected: 'unstarted' },
        { input: 'done', expected: 'completed' },
        { input: 'finished', expected: 'completed' },
        { input: 'cancelled', expected: 'canceled' }
      ];

      for (const testCase of testCases) {
        const modification: PlanModification = {
          ticketId: 'PROJ-123',
          action: 'status_change',
          value: testCase.input,
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: `Move PROJ-123 to ${testCase.input}`
        };

        await linearUpdater.applyModification(modification);

        expect(mockLinearClient.updateTicketStatus).toHaveBeenCalledWith('ticket-1', testCase.expected);
        mockLinearClient.updateTicketStatus.mockClear();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown action types', async () => {
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'unknown_action' as any,
        value: 'test',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Unknown action'
      };

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action type');
    });

    it('should handle Linear client errors gracefully', async () => {
      const modification: PlanModification = {
        ticketId: 'PROJ-123',
        action: 'status_change',
        value: 'in-progress',
        userId: 'user-123',
        timestamp: new Date(),
        originalMessage: 'Move PROJ-123 to in-progress'
      };

      mockLinearClient.updateTicketStatus.mockRejectedValue(new Error('Linear API error'));

      const result = await linearUpdater.applyModification(modification);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Linear API error');
    });
  });

  describe('Factory Function', () => {
    it('should create LinearUpdater with default options', () => {
      const updater = createLinearUpdater(mockLinearClient);
      expect(updater).toBeInstanceOf(LinearUpdater);
    });

    it('should create LinearUpdater with custom options', () => {
      const customOptions = {
        retryAttempts: 5,
        retryDelay: 2000,
        dryRun: true,
        batchSize: 20
      };

      const updater = createLinearUpdater(mockLinearClient, customOptions);
      expect(updater).toBeInstanceOf(LinearUpdater);
    });
  });
});