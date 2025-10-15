import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PlanGenerator, createPlanGenerator } from '../plan-generator.js';
import { LinearMCPClient } from '../mcp/linear-client.js';
import { LinearIssue, LinearUser, LinearTeam } from '../mcp/types.js';

// Mock the Linear MCP Client
const mockLinearClient: jest.Mocked<LinearMCPClient> = {
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
};

describe('PlanGenerator', () => {
  let planGenerator: PlanGenerator;
  let mockUsers: LinearUser[];
  let mockTickets: LinearIssue[];
  let mockTeam: LinearTeam;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUsers = [
      {
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        displayName: 'John Doe',
        avatarUrl: 'https://example.com/avatar1.jpg',
      },
      {
        id: 'user2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        displayName: 'Jane Smith',
        avatarUrl: 'https://example.com/avatar2.jpg',
      },
    ];

    mockTeam = {
      id: 'team1',
      name: 'Engineering Team',
      key: 'ENG',
      description: 'Main engineering team',
    };

    mockTickets = [
      {
        id: 'ticket1',
        identifier: 'ENG-1',
        title: 'Completed Task 1',
        description: 'This task is completed',
        state: { id: 'state1', name: 'Done', type: 'completed', color: '#36a64f', position: 1 },
        priority: 2,
        estimate: 5,
        assignee: mockUsers[0],
        creator: mockUsers[0],
        team: mockTeam,
        labels: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        completedAt: '2024-01-02T00:00:00Z',
        url: 'https://linear.app/team1/issue/ENG-1',
      },
      {
        id: 'ticket2',
        identifier: 'ENG-2',
        title: 'In Progress Task',
        description: 'This task is in progress',
        state: { id: 'state2', name: 'In Progress', type: 'started', color: '#f39c12', position: 2 },
        priority: 3,
        estimate: 8,
        assignee: mockUsers[0],
        creator: mockUsers[0],
        team: mockTeam,
        labels: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
        url: 'https://linear.app/team1/issue/ENG-2',
      },
      {
        id: 'ticket3',
        identifier: 'ENG-3',
        title: 'Open Task',
        description: 'This task is open',
        state: { id: 'state3', name: 'Todo', type: 'unstarted', color: '#9e9e9e', position: 3 },
        priority: 1,
        estimate: 3,
        assignee: mockUsers[0],
        creator: mockUsers[0],
        team: mockTeam,
        labels: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        url: 'https://linear.app/team1/issue/ENG-3',
      },
    ];

    mockLinearClient.getUsers.mockResolvedValue(mockUsers);
    mockLinearClient.getTeams.mockResolvedValue([mockTeam]);
    mockLinearClient.getTicketsByAssignee.mockResolvedValue(mockTickets);

    planGenerator = createPlanGenerator(mockLinearClient, {
      teamId: 'team1',
      includeCompletedTickets: false,
      includeCanceledTickets: false,
      maxTicketsPerUser: 50,
    });
  });

  describe('generateIndividualPlans', () => {
    it('should generate plans for all users', async () => {
      const plans = await planGenerator.generateIndividualPlans('team1');

      expect(plans).toHaveLength(2);
      expect(plans[0].userId).toBe('user1');
      expect(plans[0].userName).toBe('John Doe');
      expect(plans[0].tickets.finished).toHaveLength(0); // Completed tickets filtered out
      expect(plans[0].tickets.inProgress).toHaveLength(1);
      expect(plans[0].tickets.open).toHaveLength(1);
    });

    it('should include completed tickets when configured', async () => {
      planGenerator.updateConfig({ includeCompletedTickets: true });
      
      const plans = await planGenerator.generateIndividualPlans('team1');

      expect(plans[0].tickets.finished).toHaveLength(1);
    });

    it('should limit tickets per user', async () => {
      planGenerator.updateConfig({ maxTicketsPerUser: 1 });
      
      const plans = await planGenerator.generateIndividualPlans('team1');

      expect(plans[0].tickets.finished.length + 
             plans[0].tickets.inProgress.length + 
             plans[0].tickets.open.length).toBeLessThanOrEqual(1);
    });
  });

  describe('generateTeamSummary', () => {
    it('should generate team summary with correct statistics', async () => {
      planGenerator.updateConfig({ includeCompletedTickets: true });
      
      const summary = await planGenerator.generateTeamSummary('team1');

      expect(summary.teamId).toBe('team1');
      expect(summary.teamName).toBe('Engineering Team');
      expect(summary.totalTickets).toBe(3);
      expect(summary.completedTickets).toBe(1);
      expect(summary.inProgressTickets).toBe(1);
      expect(summary.openTickets).toBe(1);
      expect(summary.completionRate).toBeCloseTo(33.33, 1);
      expect(summary.plans).toHaveLength(2);
    });
  });

  describe('generateUserPlan', () => {
    it('should generate plan for specific user', async () => {
      const plan = await planGenerator.generateUserPlan(mockUsers[0], 'team1');

      expect(plan).not.toBeNull();
      expect(plan!.userId).toBe('user1');
      expect(plan!.userName).toBe('John Doe');
      expect(plan!.tickets.inProgress).toHaveLength(1);
      expect(plan!.tickets.open).toHaveLength(1);
    });

    it('should return null for user with no tickets', async () => {
      mockLinearClient.getTicketsByAssignee.mockResolvedValueOnce([]);
      
      const plan = await planGenerator.generateUserPlan(mockUsers[1], 'team1');

      expect(plan).toBeNull();
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      const newConfig = {
        includeCompletedTickets: true,
        maxTicketsPerUser: 100,
      };

      planGenerator.updateConfig(newConfig);
      const config = planGenerator.getConfig();

      expect(config.includeCompletedTickets).toBe(true);
      expect(config.maxTicketsPerUser).toBe(100);
    });

    it('should validate configuration', () => {
      planGenerator.updateConfig({ maxTicketsPerUser: -1 });
      
      const validation = planGenerator.validateConfig();

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('maxTicketsPerUser must be greater than 0');
    });
  });

  describe('plan summary generation', () => {
    it('should generate appropriate summary for user with many in-progress tickets', async () => {
      // Create many in-progress tickets
      const manyInProgressTickets = Array.from({ length: 6 }, (_, i) => ({
        ...mockTickets[1],
        id: `ticket${i + 10}`,
        identifier: `ENG-${i + 10}`,
        title: `In Progress Task ${i + 1}`,
      }));

      mockLinearClient.getTicketsByAssignee.mockResolvedValueOnce(manyInProgressTickets);
      
      const plan = await planGenerator.generateUserPlan(mockUsers[0], 'team1');

      expect(plan!.summary).toContain('many tickets in progress');
    });

    it('should generate appropriate summary for user with many open tickets', async () => {
      // Create many open tickets
      const manyOpenTickets = Array.from({ length: 12 }, (_, i) => ({
        ...mockTickets[2],
        id: `ticket${i + 20}`,
        identifier: `ENG-${i + 20}`,
        title: `Open Task ${i + 1}`,
      }));

      mockLinearClient.getTicketsByAssignee.mockResolvedValueOnce(manyOpenTickets);
      
      const plan = await planGenerator.generateUserPlan(mockUsers[0], 'team1');

      expect(plan!.summary).toContain('many open tickets');
    });
  });
});