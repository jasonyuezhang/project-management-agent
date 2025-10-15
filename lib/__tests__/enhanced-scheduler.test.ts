import { EnhancedPlanScheduler } from '../enhanced-scheduler.js';
import { LinearMCPClient } from '../mcp/linear-client.js';
import { SlackMCPClient } from '../mcp/slack-client.js';
import { PlanGenerator } from '../plan-generator.js';
import { ExecutionPlan, TeamSummary } from '../mcp/types.js';

// Mock dependencies
jest.mock('../mcp/linear-client.js');
jest.mock('../mcp/slack-client.js');
jest.mock('../plan-generator.js');
jest.mock('../monitoring/logger.js');

describe('EnhancedPlanScheduler', () => {
  let scheduler: EnhancedPlanScheduler;
  let mockLinearClient: jest.Mocked<LinearMCPClient>;
  let mockSlackClient: jest.Mocked<SlackMCPClient>;
  let mockPlanGenerator: jest.Mocked<PlanGenerator>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockLinearClient = {
      getTicketsByStatus: jest.fn(),
      getTicketsByAssignee: jest.fn(),
      updateTicketStatus: jest.fn(),
      updateTicketAssignee: jest.fn(),
      addTicketComment: jest.fn(),
      createCustomField: jest.fn(),
    } as any;

    mockSlackClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      sendExecutionPlanMessage: jest.fn().mockResolvedValue('message-id'),
      sendTeamSummaryMessage: jest.fn().mockResolvedValue('message-id'),
      getUsers: jest.fn().mockResolvedValue([{ id: 'user-1', name: 'Test User' }]),
      getChannels: jest.fn().mockResolvedValue([{ id: 'channel-1', name: 'general' }]),
    } as any;

    mockPlanGenerator = {
      generateIndividualPlans: jest.fn().mockResolvedValue([
        {
          id: 'plan-1',
          userId: 'user-1',
          userName: 'Test User',
          tickets: {
            finished: [],
            inProgress: [],
            open: []
          },
          summary: 'Test plan',
          generatedAt: new Date(),
          planId: 'plan-1'
        }
      ]),
      generateTeamSummary: jest.fn().mockResolvedValue({
        teamId: 'team-1',
        teamName: 'Test Team',
        totalTickets: 0,
        completedTickets: 0,
        inProgressTickets: 0,
        openTickets: 0,
        completionRate: 0,
        plans: []
      })
    } as any;

    // Create scheduler instance
    scheduler = new EnhancedPlanScheduler(
      mockLinearClient,
      mockSlackClient,
      mockPlanGenerator,
      ':memory:' // Use in-memory database for testing
    );
  });

  afterEach(async () => {
    await scheduler.shutdown();
  });

  describe('scheduleExecution', () => {
    it('should schedule execution with valid cron expression', async () => {
      const config = {
        cronExpression: '0 9 * * 1-5',
        timezone: 'America/New_York',
        enabled: true,
        adminUserId: 'admin-1',
        teamId: 'team-1'
      };

      const scheduleId = await scheduler.scheduleExecution(config);

      expect(scheduleId).toBeDefined();
      expect(scheduleId).toMatch(/^schedule_/);
    });

    it('should throw error for invalid cron expression', async () => {
      const config = {
        cronExpression: 'invalid-cron',
        timezone: 'America/New_York',
        enabled: true,
        adminUserId: 'admin-1',
        teamId: 'team-1'
      };

      await expect(scheduler.scheduleExecution(config)).rejects.toThrow();
    });

    it('should throw error for invalid timezone', async () => {
      const config = {
        cronExpression: '0 9 * * 1-5',
        timezone: 'Invalid/Timezone',
        enabled: true,
        adminUserId: 'admin-1',
        teamId: 'team-1'
      };

      await expect(scheduler.scheduleExecution(config)).rejects.toThrow();
    });
  });

  describe('triggerManualExecution', () => {
    it('should create and execute a session successfully', async () => {
      const session = await scheduler.triggerManualExecution('admin-1', 'team-1');

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^session_/);
      expect(session.status).toBe('confirmed');
      expect(session.adminUserId).toBe('admin-1');
      expect(session.teamId).toBe('team-1');
      expect(session.plans).toHaveLength(1);
      expect(mockPlanGenerator.generateIndividualPlans).toHaveBeenCalledWith('team-1');
      expect(mockPlanGenerator.generateTeamSummary).toHaveBeenCalledWith('team-1');
    });

    it('should handle execution errors gracefully', async () => {
      mockPlanGenerator.generateIndividualPlans.mockRejectedValue(new Error('Plan generation failed'));

      await expect(scheduler.triggerManualExecution('admin-1', 'team-1')).rejects.toThrow('Plan generation failed');
    });
  });

  describe('session management', () => {
    it('should retrieve active sessions', async () => {
      await scheduler.triggerManualExecution('admin-1', 'team-1');
      const sessions = await scheduler.getActiveSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].adminUserId).toBe('admin-1');
    });

    it('should retrieve specific session by ID', async () => {
      const session = await scheduler.triggerManualExecution('admin-1', 'team-1');
      const retrievedSession = await scheduler.getSession(session.id);

      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.id).toBe(session.id);
    });

    it('should update session status', async () => {
      const session = await scheduler.triggerManualExecution('admin-1', 'team-1');
      await scheduler.updateSessionStatus(session.id, 'completed');

      const updatedSession = await scheduler.getSession(session.id);
      expect(updatedSession?.status).toBe('completed');
    });
  });

  describe('retry logic', () => {
    it('should retry failed session', async () => {
      // Create a failed session
      mockPlanGenerator.generateIndividualPlans.mockRejectedValueOnce(new Error('Initial failure'));
      
      try {
        await scheduler.triggerManualExecution('admin-1', 'team-1');
      } catch (error) {
        // Expected to fail
      }

      const sessions = await scheduler.getActiveSessions();
      const failedSession = sessions.find(s => s.status === 'failed');
      
      expect(failedSession).toBeDefined();

      // Mock successful retry
      mockPlanGenerator.generateIndividualPlans.mockResolvedValueOnce([
        {
          id: 'plan-1',
          userId: 'user-1',
          userName: 'Test User',
          tickets: { finished: [], inProgress: [], open: [] },
          summary: 'Test plan',
          generatedAt: new Date(),
          planId: 'plan-1'
        }
      ]);

      const retriedSession = await scheduler.retryFailedSession(failedSession!.id);
      
      expect(retriedSession).toBeDefined();
      expect(retriedSession?.retryCount).toBe(1);
    });

    it('should not retry session that exceeded max retries', async () => {
      // Create a session with max retries
      const session = await scheduler.triggerManualExecution('admin-1', 'team-1');
      session.status = 'failed';
      session.retryCount = 3; // Max retries

      const retriedSession = await scheduler.retryFailedSession(session.id);
      
      expect(retriedSession).toBeNull();
    });
  });

  describe('execution statistics', () => {
    it('should provide execution statistics', async () => {
      await scheduler.triggerManualExecution('admin-1', 'team-1');
      
      const stats = scheduler.getExecutionStats();
      
      expect(stats).toBeDefined();
      expect(stats.totalSessions).toBe(1);
      expect(stats.confirmedSessions).toBe(1);
      expect(stats.successRate).toBe(100);
    });
  });

  describe('cleanup', () => {
    it('should cleanup old data', async () => {
      // Create some sessions
      await scheduler.triggerManualExecution('admin-1', 'team-1');
      
      const statsBefore = scheduler.getExecutionStats();
      expect(statsBefore.totalSessions).toBe(1);
      
      // Cleanup with very short age (should clean everything)
      await scheduler.cleanupOldData(0.001); // 0.001 hours = ~3.6 seconds
      
      const statsAfter = scheduler.getExecutionStats();
      expect(statsAfter.totalSessions).toBe(0);
    });
  });

  describe('schedule information', () => {
    it('should provide schedule information', async () => {
      const config = {
        cronExpression: '0 9 * * 1-5',
        timezone: 'America/New_York',
        enabled: true,
        adminUserId: 'admin-1',
        teamId: 'team-1'
      };

      await scheduler.scheduleExecution(config);
      const scheduleInfo = await scheduler.getScheduleInfo();

      expect(scheduleInfo).toBeDefined();
      expect(scheduleInfo?.config).toEqual(config);
      expect(scheduleInfo?.isActive).toBe(true);
    });
  });

  describe('graceful shutdown', () => {
    it('should shutdown gracefully', async () => {
      await scheduler.scheduleExecution({
        cronExpression: '0 9 * * 1-5',
        timezone: 'America/New_York',
        enabled: true,
        adminUserId: 'admin-1',
        teamId: 'team-1'
      });

      await expect(scheduler.shutdown()).resolves.not.toThrow();
    });
  });
});