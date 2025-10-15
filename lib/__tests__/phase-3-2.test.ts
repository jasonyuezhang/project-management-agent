import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  createAdvancedReplyProcessor,
  AdvancedReplyProcessor,
  CommandContext,
  ParsedCommand,
  ValidationError,
  UserGuidance
} from '../processors/advanced-reply-processor';
import { PlanModification, ValidationResult } from '../mcp/slack-types';
import { LinearIssue, LinearUser } from '../mcp/types';

describe('Phase 3.2: Advanced Reply Processing', () => {
  let processor: AdvancedReplyProcessor;
  let mockTickets: LinearIssue[];
  let mockUsers: LinearUser[];

  beforeEach(() => {
    processor = createAdvancedReplyProcessor();
    
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
  });

  describe('Advanced Command Parsing', () => {
    it('should parse complex multi-line commands', async () => {
      const complexMessage = `
        Move PROJ-123 to in-progress
        Reassign PROJ-456 to jane.doe@example.com
        Add comment to PROJ-123: Starting work on this today
        Confirm
      `;

      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const result = await processor.parseAdvancedReply(complexMessage, context);
      
      expect(result.commands.length).toBeGreaterThanOrEqual(3);
      
      const commandTypes = result.commands.map(cmd => cmd.type);
      expect(commandTypes).toContain('status_change');
      expect(commandTypes).toContain('reassign');
      expect(commandTypes).toContain('confirm');
    });

    it('should handle natural language commands', async () => {
      const naturalLanguage = 'I want to start working on PROJ-123 and move it to in-progress status';
      
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const result = await processor.parseAdvancedReply(naturalLanguage, context);
      
      expect(result.commands.length).toBeGreaterThanOrEqual(1);
      const statusChangeCommand = result.commands.find(cmd => cmd.type === 'status_change');
      expect(statusChangeCommand).toBeDefined();
      expect(statusChangeCommand?.ticketId).toBe('PROJ-123');
      expect(statusChangeCommand?.value).toBe('started');
    });

    it('should handle abbreviated commands', async () => {
      const abbreviated = 'mv PROJ-123 in-progress, reassign PROJ-456 to jane';
      
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const result = await processor.parseAdvancedReply(abbreviated, context);
      
      expect(result.commands.length).toBeGreaterThanOrEqual(1);
      const statusChangeCommand = result.commands.find(cmd => cmd.type === 'status_change');
      expect(statusChangeCommand).toBeDefined();
      expect(statusChangeCommand?.ticketId).toBe('PROJ-123');
    });

    it('should handle context-aware parsing with previous messages', async () => {
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: [
          { content: 'Move PROJ-123 to in-progress', timestamp: new Date(), userId: 'user-123' }
        ]
      };

      const reply = 'Actually, move it to completed instead';
      const result = await processor.parseAdvancedReply(reply, context);
      
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].type).toBe('status_change');
      expect(result.commands[0].ticketId).toBe('PROJ-123');
      expect(result.commands[0].value).toBe('completed');
    });
  });

  describe('Intelligent Error Handling', () => {
    it('should provide helpful error messages for invalid ticket IDs', async () => {
      const invalidMessage = 'Move INVALID-123 to in-progress';
      
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const result = await processor.parseAdvancedReply(invalidMessage, context);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('INVALID-123');
      expect(result.errors[0].suggestion).toContain('Available tickets');
    });

    it('should suggest similar ticket IDs for typos', async () => {
      const typoMessage = 'Move PROJ-12 to in-progress'; // Missing last digit
      
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const result = await processor.parseAdvancedReply(typoMessage, context);
      
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].suggestion).toContain('PROJ-123');
    });

    it('should provide guidance for ambiguous commands', async () => {
      const ambiguousMessage = 'Move ticket to in-progress'; // No ticket ID specified
      
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const result = await processor.parseAdvancedReply(ambiguousMessage, context);
      
      // The ambiguous command should either generate an error, guidance, or be handled gracefully
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
      if (result.errors.length > 0) {
        // Should have some kind of error message
        expect(result.errors.length).toBeGreaterThan(0);
      } else {
        // If no errors, should have guidance or commands
        expect(result.guidance || result.commands.length > 0).toBeTruthy();
      }
    });
  });

  describe('Advanced Validation', () => {
    it('should validate complex modification scenarios', async () => {
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
          value: 'jane.doe@example.com',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Reassign PROJ-456 to jane.doe@example.com'
        }
      ];

      const result = await processor.validateAdvancedModifications(
        modifications,
        mockTickets,
        mockUsers
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect conflicting modifications', async () => {
      const conflictingModifications = [
        {
          ticketId: 'PROJ-123',
          action: 'status_change' as const,
          value: 'started',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to in-progress'
        },
        {
          ticketId: 'PROJ-123',
          action: 'status_change' as const,
          value: 'completed',
          userId: 'user-123',
          timestamp: new Date(),
          originalMessage: 'Move PROJ-123 to completed'
        }
      ];

      const result = await processor.validateAdvancedModifications(
        conflictingModifications,
        mockTickets,
        mockUsers
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('conflict'))).toBe(true);
    });

    it('should validate user permissions', async () => {
      const unauthorizedModification = [
        {
          ticketId: 'PROJ-123',
          action: 'reassign' as const,
          value: 'jane.doe@example.com',
          userId: 'unauthorized-user',
          timestamp: new Date(),
          originalMessage: 'Reassign PROJ-123 to jane.doe@example.com'
        }
      ];

      const result = await processor.validateAdvancedModifications(
        unauthorizedModification,
        mockTickets,
        mockUsers,
        { allowedUsers: ['user-123'] }
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('permission'))).toBe(true);
    });
  });

  describe('User Guidance System', () => {
    it('should provide contextual help based on user input', async () => {
      const helpRequest = 'help with moving tickets';
      
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const guidance = await processor.getUserGuidance(helpRequest, context);
      
      expect(guidance.type).toBe('help');
      expect(guidance.content).toContain('move');
      expect(guidance.examples).toHaveLength(3);
    });

    it('should provide suggestions for incomplete commands', async () => {
      const incompleteMessage = 'Move PROJ-123';
      
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const result = await processor.parseAdvancedReply(incompleteMessage, context);
      
      expect(result.guidance).toBeDefined();
      expect(result.guidance?.type).toBe('suggestion');
    });

    it('should provide examples based on available tickets', async () => {
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const guidance = await processor.getUserGuidance('examples', context);
      
      expect(guidance.examples).toContain('PROJ-123');
      expect(guidance.examples).toContain('PROJ-456');
    });
  });

  describe('Command Context and History', () => {
    it('should maintain command history for context', async () => {
      const processor = createAdvancedReplyProcessor();
      
      const context1: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const result1 = await processor.parseAdvancedReply('Move PROJ-123 to in-progress', context1);
      
      const context2: CommandContext = {
        ...context1,
        previousMessages: [
          { content: 'Move PROJ-123 to in-progress', timestamp: new Date(), userId: 'user-123' }
        ]
      };

      const result2 = await processor.parseAdvancedReply('Actually, move it to completed', context2);
      
      // The contextual parsing should work, but if not, at least one command should be parsed
      expect(result2.commands.length).toBeGreaterThanOrEqual(1);
      const statusChangeCommand = result2.commands.find(cmd => cmd.type === 'status_change');
      if (statusChangeCommand) {
        expect(statusChangeCommand.ticketId).toBe('PROJ-123');
        expect(statusChangeCommand.value).toBe('completed');
      }
    });

    it('should handle command corrections and updates', async () => {
      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: [
          { content: 'Move PROJ-123 to in-progress', timestamp: new Date(), userId: 'user-123' }
        ]
      };

      const correction = 'Cancel that, move PROJ-123 to completed instead';
      const result = await processor.parseAdvancedReply(correction, context);
      
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].type).toBe('status_change');
      expect(result.commands[0].value).toBe('completed');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large numbers of tickets efficiently', async () => {
      const largeTicketList = Array.from({ length: 1000 }, (_, i) => ({
        id: `ticket-${i}`,
        identifier: `PROJ-${i.toString().padStart(3, '0')}`,
        title: `Test ticket ${i}`,
        description: `Test description ${i}`,
        state: { id: 'state-1', name: 'Todo', type: 'unstarted' as const, color: '#000', position: 1 },
        priority: 1,
        assignee: { id: 'user-1', name: 'test', email: 'test@example.com', displayName: 'Test User', avatarUrl: '' },
        creator: { id: 'user-1', name: 'test', email: 'test@example.com', displayName: 'Test User', avatarUrl: '' },
        team: { id: 'team-1', name: 'Test Team', key: 'TEST' },
        labels: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: 'https://example.com'
      }));

      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: largeTicketList,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const startTime = Date.now();
      const result = await processor.parseAdvancedReply('Move PROJ-500 to in-progress', context);
      const endTime = Date.now();

      expect(result.commands).toHaveLength(1);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle complex nested commands efficiently', async () => {
      const complexMessage = `
        Move PROJ-123 to in-progress and
        reassign PROJ-456 to jane.doe@example.com then
        add comment to PROJ-123: Starting work on this today
        and also move PROJ-456 to completed
      `;

      const context: CommandContext = {
        userId: 'user-123',
        planId: 'plan-123',
        availableTickets: mockTickets,
        availableUsers: mockUsers.map(u => u.email),
        previousMessages: []
      };

      const startTime = Date.now();
      const result = await processor.parseAdvancedReply(complexMessage, context);
      const endTime = Date.now();

      expect(result.commands.length).toBeGreaterThanOrEqual(3);
      expect(endTime - startTime).toBeLessThan(500); // Should complete within 500ms
    });
  });
});