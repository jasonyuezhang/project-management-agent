import { createSlackMCPClient } from '../slack-client';
import { createReplyProcessor } from '../../processors/reply-processor';

describe('Slack MCP Client', () => {
  let slackClient: ReturnType<typeof createSlackMCPClient>;
  let replyProcessor: ReturnType<typeof createReplyProcessor>;

  beforeEach(() => {
    slackClient = createSlackMCPClient();
    replyProcessor = createReplyProcessor();
  });

  describe('Reply Processing', () => {
    it('should parse status change commands', async () => {
      const reply = 'Move PROJ-123 to in-progress';
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(1);
      expect(modifications[0]).toEqual({
        ticketId: 'PROJ-123',
        action: 'status_change',
        value: 'started',
        userId: 'user-123',
        timestamp: expect.any(Date),
        originalMessage: reply
      });
    });

    it('should parse reassignment commands', async () => {
      const reply = 'Reassign PROJ-456 to john.doe@example.com';
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(1);
      expect(modifications[0]).toEqual({
        ticketId: 'PROJ-456',
        action: 'reassign',
        value: 'john.doe@example.com',
        userId: 'user-123',
        timestamp: expect.any(Date),
        originalMessage: reply
      });
    });

    it('should parse comment commands', async () => {
      const reply = 'Add comment to PROJ-789: Starting work on this today';
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(1);
      expect(modifications[0]).toEqual({
        ticketId: 'PROJ-789',
        action: 'comment',
        value: 'Starting work on this today',
        userId: 'user-123',
        timestamp: expect.any(Date),
        originalMessage: reply
      });
    });

    it('should parse confirmation commands', async () => {
      const reply = 'Confirm';
      const modifications = await replyProcessor.parseUserReply(reply, 'user-123');
      
      expect(modifications).toHaveLength(1);
      expect(modifications[0]).toEqual({
        ticketId: 'ALL',
        action: 'comment',
        value: 'Plan confirmed by user',
        userId: 'user-123',
        timestamp: expect.any(Date),
        originalMessage: reply
      });
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
          state: { id: 'state-1', name: 'Todo', type: 'unstarted' as const, color: '#000', position: 1 },
          priority: 1,
          creator: { id: 'user-1', name: 'test', email: 'test@example.com', displayName: 'Test User' },
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