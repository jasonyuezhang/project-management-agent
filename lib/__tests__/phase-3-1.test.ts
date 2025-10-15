import { describe, it, expect } from '@jest/globals';
import { 
  createExecutionPlanMessage,
  createTeamSummaryMessage,
  createConfirmationMessage,
  createErrorMessage,
  createHelpMessage,
  createPlanModificationMessage,
  createReminderMessage,
  createPlanStatusUpdateMessage,
  createValidationErrorMessage
} from '../templates/slack-templates';
import { createReplyProcessor } from '../processors/reply-processor';
import { ExecutionPlan, TeamSummary, LinearIssue, LinearUser, LinearTeam } from '../mcp/types';

describe('Phase 3.1: Slack Message Templates', () => {
  const mockPlan: ExecutionPlan = {
    userId: 'user-123',
    userName: 'Test User',
    tickets: {
      finished: [
        {
          id: 'ticket-1',
          identifier: 'PROJ-123',
          title: 'Completed task',
          description: 'This task is completed',
          state: {
            id: 'state-1',
            name: 'Done',
            type: 'completed',
            color: '#36a64f',
            position: 1
          },
          priority: 2,
          assignee: {
            id: 'user-1',
            name: 'testuser',
            email: 'test@example.com',
            displayName: 'Test User',
            avatarUrl: 'https://example.com/avatar.png'
          },
          creator: {
            id: 'user-1',
            name: 'testuser',
            email: 'test@example.com',
            displayName: 'Test User',
            avatarUrl: 'https://example.com/avatar.png'
          },
          team: {
            id: 'team-1',
            name: 'Test Team',
            key: 'TEST'
          },
          labels: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          url: 'https://linear.app/test-team/issue/PROJ-123'
        }
      ],
      inProgress: [],
      open: []
    },
    summary: 'You have 1 completed task.',
    generatedAt: new Date(),
    planId: 'test-plan-123'
  };

  const mockSummary: TeamSummary = {
    teamId: 'team-1',
    teamName: 'Test Team',
    totalTickets: 5,
    completedTickets: 3,
    inProgressTickets: 1,
    openTickets: 1,
    completionRate: 60,
    generatedAt: new Date(),
    plans: [mockPlan]
  };

  describe('Execution Plan Message Template', () => {
    it('should create execution plan message with correct structure', () => {
      const message = createExecutionPlanMessage(mockPlan, 'channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('Your Execution Plan');
      expect(message.blocks).toBeDefined();
      expect(message.blocks.length).toBeGreaterThan(0);
      expect(message.attachments).toBeDefined();
      expect(message.attachments.length).toBeGreaterThan(0);
    });

    it('should include completed tickets section', () => {
      const message = createExecutionPlanMessage(mockPlan, 'channel-123');
      const completedSection = message.blocks.find(block => 
        block.type === 'section' && 
        block.text?.text?.includes('Completed Tickets')
      );
      
      expect(completedSection).toBeDefined();
    });

    it('should include action buttons', () => {
      const message = createExecutionPlanMessage(mockPlan, 'channel-123');
      const actionsBlock = message.blocks.find(block => block.type === 'actions');
      
      expect(actionsBlock).toBeDefined();
      expect(actionsBlock.elements).toBeDefined();
      expect(actionsBlock.elements.length).toBe(2);
    });
  });

  describe('Team Summary Message Template', () => {
    it('should create team summary message with correct structure', () => {
      const message = createTeamSummaryMessage(mockSummary, 'channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('Team Summary');
      expect(message.blocks).toBeDefined();
      expect(message.attachments).toBeDefined();
    });

    it('should include team statistics', () => {
      const message = createTeamSummaryMessage(mockSummary, 'channel-123');
      const statsSection = message.blocks.find(block => 
        block.type === 'section' && 
        block.fields?.some(field => field.text.includes('Total Tickets'))
      );
      
      expect(statsSection).toBeDefined();
    });
  });

  describe('Confirmation Message Template', () => {
    it('should create confirmation message', () => {
      const message = createConfirmationMessage('plan-123', 'channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('Plan Confirmed');
      expect(message.blocks).toBeDefined();
    });
  });

  describe('Error Message Template', () => {
    it('should create error message', () => {
      const message = createErrorMessage('Test error', 'channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('Error');
      expect(message.blocks).toBeDefined();
    });
  });

  describe('Help Message Template', () => {
    it('should create help message with commands', () => {
      const message = createHelpMessage('channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('How to Use Execution Plans');
      expect(message.blocks).toBeDefined();
    });
  });

  describe('Plan Modification Message Template', () => {
    it('should create plan modification message', () => {
      const modifications = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change' as const,
          value: 'started',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to in-progress'
        }
      ];

      const message = createPlanModificationMessage('plan-123', modifications, 'channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('Plan Modified');
      expect(message.blocks).toBeDefined();
    });
  });

  describe('Reminder Message Template', () => {
    it('should create reminder message', () => {
      const message = createReminderMessage('plan-123', 'Test User', 'channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('Reminder');
      expect(message.blocks).toBeDefined();
    });
  });

  describe('Plan Status Update Template', () => {
    it('should create status update message for confirmed plan', () => {
      const message = createPlanStatusUpdateMessage('plan-123', 'confirmed', 'channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('Plan plan-123 status: Confirmed');
      expect(message.blocks).toBeDefined();
    });
  });

  describe('Validation Error Message Template', () => {
    it('should create validation error message', () => {
      const errors = ['Invalid ticket ID', 'Invalid status'];
      const warnings = ['Warning message'];
      
      const message = createValidationErrorMessage(errors, warnings, 'channel-123');
      
      expect(message.channel).toBe('channel-123');
      expect(message.text).toContain('Validation Errors');
      expect(message.blocks).toBeDefined();
    });
  });
});

describe('Phase 3.1: Reply Processing', () => {
  const replyProcessor = createReplyProcessor();

  describe('Reply Parser', () => {
    it('should parse status change commands', async () => {
      const reply = 'Move PROJ-123 to in-progress';
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(1);
      expect(modifications[0].ticketId).toBe('PROJ-123');
      expect(modifications[0].action).toBe('status_change');
      expect(modifications[0].value).toBe('started');
    });

    it('should parse reassignment commands', async () => {
      const reply = 'Reassign PROJ-456 to john.doe@example.com';
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(1);
      expect(modifications[0].ticketId).toBe('PROJ-456');
      expect(modifications[0].action).toBe('reassign');
      expect(modifications[0].value).toBe('john.doe@example.com');
    });

    it('should parse comment commands', async () => {
      const reply = 'Add comment to PROJ-789: Starting work on this today';
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(1);
      expect(modifications[0].ticketId).toBe('PROJ-789');
      expect(modifications[0].action).toBe('comment');
      expect(modifications[0].value).toBe('Starting work on this today');
    });

    it('should parse confirmation commands', async () => {
      const reply = 'Confirm';
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(1);
      expect(modifications[0].ticketId).toBe('ALL');
      expect(modifications[0].action).toBe('comment');
      expect(modifications[0].value).toBe('Plan confirmed by user');
    });

    it('should handle multiple commands in one message', async () => {
      const reply = `Move PROJ-123 to in-progress
Reassign PROJ-456 to john.doe@example.com
Add comment to PROJ-789: Starting work on this today`;
      
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(3);
      expect(modifications[0].action).toBe('status_change');
      expect(modifications[1].action).toBe('reassign');
      expect(modifications[2].action).toBe('comment');
    });

    it('should extract ticket IDs from messages', () => {
      const message = 'Move PROJ-123 to in-progress and reassign PROJ-456 to john.doe';
      const ticketIds = replyProcessor.extractTicketIds(message);
      
      expect(ticketIds).toEqual(['PROJ-123', 'PROJ-456']);
    });

    it('should detect if message contains modifications', () => {
      expect(replyProcessor.containsModifications('Move PROJ-123 to in-progress')).toBe(true);
      expect(replyProcessor.containsModifications('Reassign PROJ-456 to john.doe')).toBe(true);
      expect(replyProcessor.containsModifications('Add comment to PROJ-789: test')).toBe(true);
      expect(replyProcessor.containsModifications('Confirm')).toBe(true);
      expect(replyProcessor.containsModifications('Yes')).toBe(true);
      expect(replyProcessor.containsModifications('Hello world')).toBe(false);
    });

    it('should format modifications for display', () => {
      const modifications = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change' as const,
          value: 'started',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to in-progress'
        },
        {
          ticketId: 'PROJ-456',
          action: 'reassign' as const,
          value: 'john.doe',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Reassign PROJ-456 to john.doe'
        }
      ];

      const formatted = replyProcessor.formatModifications(modifications);
      
      expect(formatted).toBe('• Move PROJ-123 to started\n• Reassign PROJ-456 to john.doe');
    });
  });

  describe('Validation', () => {
    it('should validate modifications correctly', async () => {
      const modifications = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change' as const,
          value: 'started',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to in-progress'
        }
      ];

      const availableTickets = [
        {
          id: 'ticket-1',
          identifier: 'PROJ-123',
          title: 'Test ticket',
          description: 'Test description',
          state: { id: 'state-1', name: 'Todo', type: 'unstarted' as const, color: '#000', position: 1 },
          priority: 1,
          assignee: { id: 'user-1', name: 'test', email: 'test@example.com', displayName: 'Test User', avatarUrl: '' },
          creator: { id: 'user-1', name: 'test', email: 'test@example.com', displayName: 'Test User', avatarUrl: '' },
          team: { id: 'team-1', name: 'Test Team', key: 'TEST' },
          labels: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          url: 'https://example.com'
        }
      ];

      const availableUsers = ['john.doe@example.com', 'jane.doe@example.com'];

      const result = await replyProcessor.validateModifications(
        modifications,
        availableTickets,
        availableUsers
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.modifications).toHaveLength(1);
    });

    it('should detect invalid ticket IDs', async () => {
      const modifications = [
        {
          ticketId: 'INVALID-123',
          action: 'status_change' as const,
          value: 'started',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move INVALID-123 to in-progress'
        }
      ];

      const result = await replyProcessor.validateModifications(
        modifications,
        [],
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Ticket INVALID-123 not found');
    });

    it('should detect invalid status values', async () => {
      const modifications = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change' as const,
          value: 'invalid-status',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to invalid-status'
        }
      ];

      const result = await replyProcessor.validateModifications(
        modifications,
        [],
        []
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid status: invalid-status');
    });
  });
});