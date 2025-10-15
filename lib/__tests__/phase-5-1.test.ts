import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createLinearMCPClient } from '../mcp/linear-client.js';
import { createLinearStorageService, LinearStorageConfig } from '../services/linear-storage-service.js';
import { createLinearUpdater } from '../updaters/linear-updater.js';
import { ExecutionPlan } from '../mcp/types.js';

// Mock the Linear MCP client
jest.mock('../mcp/linear-client.js', () => ({
  createLinearMCPClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    ensureCustomFieldDefinitions: jest.fn().mockResolvedValue(undefined),
    storeExecutionPlanComments: jest.fn().mockResolvedValue(undefined),
    storeExecutionPlanMetadata: jest.fn().mockResolvedValue(undefined),
    getExecutionPlanMetadata: jest.fn().mockResolvedValue({
      planId: 'test-plan-123',
      lastPlanDate: '2024-01-15T10:00:00Z',
    }),
    findTicketsByExecutionPlan: jest.fn().mockResolvedValue([]),
    cleanupOldExecutionPlans: jest.fn().mockResolvedValue({ cleaned: 0, errors: [] }),
    getStorageStats: jest.fn().mockResolvedValue({
      totalPlansStored: 0,
      totalCommentsAdded: 0,
      totalCustomFieldsUpdated: 0,
    }),
  })),
}));

describe('Phase 5.1: Linear as Primary Storage', () => {
  let mockLinearClient: any;
  let storageConfig: LinearStorageConfig;
  let storageService: any;
  let updater: any;

  beforeEach(() => {
    mockLinearClient = createLinearMCPClient();
    storageConfig = {
      customFieldIds: {
        executionPlanId: 'execution_plan_id',
        lastPlanDate: 'last_plan_date',
      },
      teamId: 'test-team-123',
      enableComments: true,
      enableCustomFields: true,
    };
    storageService = createLinearStorageService(mockLinearClient, storageConfig);
    updater = createLinearUpdater(mockLinearClient, {}, storageConfig);
  });

  describe('LinearStorageService', () => {
    it('should store execution plan with comments and custom fields', async () => {
      const plan: ExecutionPlan = {
        userId: 'user-123',
        userName: 'Test User',
        tickets: {
          finished: [],
          inProgress: [],
          open: [],
        },
        summary: 'Test execution plan',
        generatedAt: new Date(),
        planId: 'test-plan-123',
      };

      const result = await storageService.storeExecutionPlan(plan);

      expect(result.success).toBe(true);
      expect(result.planId).toBe('test-plan-123');
      expect(mockLinearClient.ensureCustomFieldDefinitions).toHaveBeenCalledWith(
        'test-team-123',
        storageConfig.customFieldIds
      );
      expect(mockLinearClient.storeExecutionPlanComments).toHaveBeenCalledWith(plan);
      expect(mockLinearClient.storeExecutionPlanMetadata).toHaveBeenCalledWith(
        plan,
        storageConfig.customFieldIds
      );
    });

    it('should store multiple execution plans in batch', async () => {
      const plans: ExecutionPlan[] = [
        {
          userId: 'user-1',
          userName: 'User 1',
          tickets: { finished: [], inProgress: [], open: [] },
          summary: 'Plan 1',
          generatedAt: new Date(),
          planId: 'plan-1',
        },
        {
          userId: 'user-2',
          userName: 'User 2',
          tickets: { finished: [], inProgress: [], open: [] },
          summary: 'Plan 2',
          generatedAt: new Date(),
          planId: 'plan-2',
        },
      ];

      const results = await storageService.storeExecutionPlans(plans);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should retrieve execution plan metadata', async () => {
      const metadata = await storageService.getExecutionPlanMetadata('ticket-123');

      expect(metadata).toEqual({
        planId: 'test-plan-123',
        lastPlanDate: '2024-01-15T10:00:00Z',
        userId: '',
        userName: '',
        ticketCount: 0,
        completedCount: 0,
        inProgressCount: 0,
        openCount: 0,
      });
    });

    it('should handle storage errors gracefully', async () => {
      mockLinearClient.storeExecutionPlanComments.mockRejectedValueOnce(
        new Error('Storage failed')
      );

      const plan: ExecutionPlan = {
        userId: 'user-123',
        userName: 'Test User',
        tickets: { finished: [], inProgress: [], open: [] },
        summary: 'Test execution plan',
        generatedAt: new Date(),
        planId: 'test-plan-123',
      };

      const result = await storageService.storeExecutionPlan(plan);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Failed to store execution plan comments: Storage failed');
    });
  });

  describe('LinearUpdater with Storage', () => {
    it('should store execution plan using updater', async () => {
      const plan: ExecutionPlan = {
        userId: 'user-123',
        userName: 'Test User',
        tickets: { finished: [], inProgress: [], open: [] },
        summary: 'Test execution plan',
        generatedAt: new Date(),
        planId: 'test-plan-123',
      };

      await updater.storeExecutionPlan(plan);

      expect(mockLinearClient.ensureCustomFieldDefinitions).toHaveBeenCalled();
      expect(mockLinearClient.storeExecutionPlanComments).toHaveBeenCalledWith(plan);
      expect(mockLinearClient.storeExecutionPlanMetadata).toHaveBeenCalledWith(
        plan,
        storageConfig.customFieldIds
      );
    });

    it('should store multiple execution plans using updater', async () => {
      const plans: ExecutionPlan[] = [
        {
          userId: 'user-1',
          userName: 'User 1',
          tickets: { finished: [], inProgress: [], open: [] },
          summary: 'Plan 1',
          generatedAt: new Date(),
          planId: 'plan-1',
        },
        {
          userId: 'user-2',
          userName: 'User 2',
          tickets: { finished: [], inProgress: [], open: [] },
          summary: 'Plan 2',
          generatedAt: new Date(),
          planId: 'plan-2',
        },
      ];

      await updater.storeExecutionPlans(plans);

      expect(mockLinearClient.storeExecutionPlanComments).toHaveBeenCalledTimes(2);
      expect(mockLinearClient.storeExecutionPlanMetadata).toHaveBeenCalledTimes(2);
    });

    it('should retrieve execution plan metadata using updater', async () => {
      const metadata = await updater.getExecutionPlanMetadata('ticket-123');

      expect(metadata).toBeDefined();
      expect(mockLinearClient.getExecutionPlanMetadata).toHaveBeenCalledWith(
        'ticket-123',
        storageConfig.customFieldIds
      );
    });
  });

  describe('Custom Field Management', () => {
    it('should ensure custom field definitions exist', async () => {
      await storageService.storeExecutionPlan({
        userId: 'user-123',
        userName: 'Test User',
        tickets: { finished: [], inProgress: [], open: [] },
        summary: 'Test execution plan',
        generatedAt: new Date(),
        planId: 'test-plan-123',
      });

      expect(mockLinearClient.ensureCustomFieldDefinitions).toHaveBeenCalledWith(
        'test-team-123',
        {
          executionPlanId: 'execution_plan_id',
          lastPlanDate: 'last_plan_date',
        }
      );
    });
  });

  describe('Comment Storage', () => {
    it('should store execution plan comments on all tickets', async () => {
      const plan: ExecutionPlan = {
        userId: 'user-123',
        userName: 'Test User',
        tickets: {
          finished: [
            { id: 'ticket-1', identifier: 'T-1', title: 'Finished 1' } as any,
          ],
          inProgress: [
            { id: 'ticket-2', identifier: 'T-2', title: 'In Progress 1' } as any,
          ],
          open: [
            { id: 'ticket-3', identifier: 'T-3', title: 'Open 1' } as any,
          ],
        },
        summary: 'Test execution plan',
        generatedAt: new Date(),
        planId: 'test-plan-123',
      };

      await storageService.storeExecutionPlan(plan);

      expect(mockLinearClient.storeExecutionPlanComments).toHaveBeenCalledWith(plan);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing storage service gracefully', async () => {
      const updaterWithoutStorage = createLinearUpdater(mockLinearClient, {});

      const plan: ExecutionPlan = {
        userId: 'user-123',
        userName: 'Test User',
        tickets: { finished: [], inProgress: [], open: [] },
        summary: 'Test execution plan',
        generatedAt: new Date(),
        planId: 'test-plan-123',
      };

      await expect(updaterWithoutStorage.storeExecutionPlan(plan)).rejects.toThrow(
        'Storage service not configured'
      );
    });
  });
});
