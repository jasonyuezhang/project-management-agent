import { PlanModification, ValidationResult } from '../mcp/slack-types.js';
import { LinearIssue, LinearUser } from '../mcp/types.js';

// Enhanced types for advanced reply processing
export interface CommandContext {
  userId: string;
  planId: string;
  availableTickets: LinearIssue[];
  availableUsers: string[];
  previousMessages: MessageHistory[];
  userPermissions?: UserPermissions;
}

export interface MessageHistory {
  content: string;
  timestamp: Date;
  userId: string;
}

export interface UserPermissions {
  allowedUsers: string[];
  canReassign: boolean;
  canChangeStatus: boolean;
  canAddComments: boolean;
}

export interface ParsedCommand {
  type: 'status_change' | 'reassign' | 'comment' | 'confirm' | 'help' | 'unknown';
  ticketId?: string;
  value?: string;
  confidence: number;
  originalText: string;
  suggestions?: string[];
}

export interface ValidationError {
  message: string;
  suggestion?: string;
  code: string;
}

export interface UserGuidance {
  type: 'help' | 'suggestion' | 'error' | 'confirmation';
  content: string;
  examples: string[];
  relatedCommands?: string[];
}

export interface AdvancedParseResult {
  commands: ParsedCommand[];
  errors: ValidationError[];
  warnings: string[];
  guidance?: UserGuidance;
  confidence: number;
}

export class AdvancedReplyProcessor {
  private ticketIdPattern = /([A-Z]+-\d+)/g;
  private statusPattern = /(backlog|unstarted|in-progress|started|completed|canceled|cancelled)/gi;
  private userPattern = /@?([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g;
  private naturalLanguagePatterns = {
    start: /(start|begin|work on|pick up)/gi,
    complete: /(complete|finish|done|close)/gi,
    move: /(move|change|update|set)/gi,
    assign: /(assign|give|hand over|transfer)/gi,
    comment: /(comment|note|add|say)/gi
  };

  async parseAdvancedReply(message: string, context: CommandContext): Promise<AdvancedParseResult> {
    const commands: ParsedCommand[] = [];
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    let confidence = 0;

    // Clean and normalize the message
    const cleanMessage = this.cleanMessage(message);
    
    // Check for help requests
    if (this.isHelpRequest(cleanMessage)) {
      const guidance = await this.getUserGuidance(cleanMessage, context);
      return {
        commands: [{ type: 'help', confidence: 1, originalText: cleanMessage }],
        errors: [],
        warnings: [],
        guidance,
        confidence: 1
      };
    }

    // Parse different types of commands
    const lines = this.splitIntoLines(cleanMessage);
    
    for (const line of lines) {
      const command = await this.parseLine(line, context);
      if (command) {
        commands.push(command);
        confidence += command.confidence;
      }
    }

    // Validate commands
    const validationResult = await this.validateAdvancedModifications(
      commands.map(cmd => this.commandToModification(cmd, context.userId)),
      context.availableTickets,
      context.availableUsers.map(email => ({ email } as LinearUser)),
      context.userPermissions
    );

      // Add validation errors
      errors.push(...validationResult.errors.map(err => ({
        message: err,
        code: 'VALIDATION_ERROR',
        suggestion: this.generateSuggestion(err, context)
      })));

    // Generate guidance if needed
    let guidance: UserGuidance | undefined;
    if (errors.length > 0 || commands.length === 0 || commands.some(cmd => cmd.type === 'unknown')) {
      guidance = await this.generateGuidance(cleanMessage, context, errors);
    }

    return {
      commands,
      errors,
      warnings: [...warnings, ...validationResult.warnings],
      guidance,
      confidence: commands.length > 0 ? confidence / commands.length : 0
    };
  }

  private cleanMessage(message: string): string {
    return message
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s@.-]/g, ' ')
      .trim();
  }

  private isHelpRequest(message: string): boolean {
    const helpPatterns = [
      /help/i,
      /how to/i,
      /what can/i,
      /commands/i,
      /examples/i,
      /\?/
    ];
    
    return helpPatterns.some(pattern => pattern.test(message));
  }

  private splitIntoLines(message: string): string[] {
    // First split by newlines
    let lines = message
      .split(/[\n\r]+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    // If we only got one line, try to split by other separators
    if (lines.length === 1) {
      // Try to split by looking for command keywords
      const text = lines[0];
      const commands: string[] = [];
      
      // Find all command starts
      const commandStarts = [
        { keyword: 'move', pattern: /move\s+/gi },
        { keyword: 'reassign', pattern: /reassign\s+/gi },
        { keyword: 'add comment', pattern: /add\s+comment/gi },
        { keyword: 'confirm', pattern: /confirm/gi }
      ];
      
      let lastIndex = 0;
      for (const { keyword, pattern } of commandStarts) {
        const match = text.slice(lastIndex).search(pattern);
        if (match !== -1) {
          const startIndex = lastIndex + match;
          commands.push(text.slice(lastIndex, startIndex).trim());
          lastIndex = startIndex;
        }
      }
      
      // Add the rest
      if (lastIndex < text.length) {
        commands.push(text.slice(lastIndex).trim());
      }
      
      // Filter out empty commands and clean up
      lines = commands
        .filter(cmd => cmd.length > 0)
        .map(cmd => cmd.trim());
    }
    
    return lines;
  }

  private containsMultipleCommands(text: string): boolean {
    const commandKeywords = ['move', 'reassign', 'add comment', 'confirm'];
    let count = 0;
    for (const keyword of commandKeywords) {
      if (text.toLowerCase().includes(keyword)) {
        count++;
      }
    }
    return count > 1;
  }

  private splitMultipleCommands(text: string): string[] {
    const commands: string[] = [];
    
    // Split by common separators and process each part
    const parts = text.split(/(?:\s+and\s+|\s+then\s+|\s+also\s+|\s+next\s+)/gi);
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        commands.push(trimmed);
      }
    }
    
    return commands;
  }

  private async parseLine(line: string, context: CommandContext): Promise<ParsedCommand | null> {
    const lowerLine = line.toLowerCase();
    
    // Try different parsing strategies
    const strategies = [
      () => this.parseExplicitCommand(line, context),
      () => this.parseNaturalLanguage(line, context),
      () => this.parseAbbreviatedCommand(line, context),
      () => this.parseContextualCommand(line, context)
    ];

    for (const strategy of strategies) {
      const result = await strategy();
      if (result && result.confidence > 0.5) {
        return result;
      }
    }

    // If no command found, check for ambiguous commands
    if (this.isAmbiguousCommand(line)) {
      return {
        type: 'unknown',
        confidence: 0.3,
        originalText: line
      };
    }

    return null;
  }

  private async parseExplicitCommand(line: string, context: CommandContext): Promise<ParsedCommand | null> {
    const lowerLine = line.toLowerCase();
    let confidence = 0.8;

    // Status change
    if (lowerLine.includes('move') && lowerLine.includes('to')) {
      const ticketId = this.extractTicketId(line);
      const status = this.extractStatus(line);
      
      if (ticketId && status) {
        return {
          type: 'status_change',
          ticketId,
          value: this.normalizeStatus(status),
          confidence,
          originalText: line
        };
      }
    }

    // Reassignment
    if (lowerLine.includes('reassign') && lowerLine.includes('to')) {
      const ticketId = this.extractTicketId(line);
      const user = this.extractUser(line);
      
      if (ticketId && user) {
        return {
          type: 'reassign',
          ticketId,
          value: user,
          confidence,
          originalText: line
        };
      }
    }

    // Comment
    if (lowerLine.includes('add comment') || lowerLine.includes('comment')) {
      const ticketId = this.extractTicketId(line);
      const comment = this.extractComment(line);
      
      if (ticketId && comment) {
        return {
          type: 'comment',
          ticketId,
          value: comment,
          confidence,
          originalText: line
        };
      }
    }

    // Confirmation
    if (lowerLine.includes('confirm') || lowerLine === 'yes' || lowerLine === 'y') {
      return {
        type: 'confirm',
        confidence: 0.9,
        originalText: line
      };
    }

    return null;
  }

  private async parseNaturalLanguage(line: string, context: CommandContext): Promise<ParsedCommand | null> {
    const lowerLine = line.toLowerCase();
    let confidence = 0.6;

    // "I want to start working on PROJ-123"
    if (this.naturalLanguagePatterns.start.test(lowerLine)) {
      const ticketId = this.extractTicketId(line);
      if (ticketId) {
        return {
          type: 'status_change',
          ticketId,
          value: 'started',
          confidence,
          originalText: line
        };
      }
    }

    // "I'm done with PROJ-123"
    if (this.naturalLanguagePatterns.complete.test(lowerLine)) {
      const ticketId = this.extractTicketId(line);
      if (ticketId) {
        return {
          type: 'status_change',
          ticketId,
          value: 'completed',
          confidence,
          originalText: line
        };
      }
    }

    // "Give PROJ-123 to john"
    if (this.naturalLanguagePatterns.assign.test(lowerLine)) {
      const ticketId = this.extractTicketId(line);
      const user = this.extractUser(line);
      
      if (ticketId && user) {
        return {
          type: 'reassign',
          ticketId,
          value: user,
          confidence,
          originalText: line
        };
      }
    }

    return null;
  }

  private async parseAbbreviatedCommand(line: string, context: CommandContext): Promise<ParsedCommand | null> {
    const lowerLine = line.toLowerCase();
    let confidence = 0.7;

    // "mv PROJ-123 in-progress"
    if (lowerLine.startsWith('mv ') || lowerLine.startsWith('move ')) {
      const ticketId = this.extractTicketId(line);
      const status = this.extractStatus(line);
      
      if (ticketId && status) {
        return {
          type: 'status_change',
          ticketId,
          value: this.normalizeStatus(status),
          confidence,
          originalText: line
        };
      }
    }

    // "as PROJ-123 john"
    if (lowerLine.startsWith('as ') || lowerLine.startsWith('assign ')) {
      const ticketId = this.extractTicketId(line);
      const user = this.extractUser(line);
      
      if (ticketId && user) {
        return {
          type: 'reassign',
          ticketId,
          value: user,
          confidence,
          originalText: line
        };
      }
    }

    return null;
  }

  private async parseContextualCommand(line: string, context: CommandContext): Promise<ParsedCommand | null> {
    // Look for references to previous commands
    const contextualPatterns = [
      /actually/i,
      /instead/i,
      /change that/i,
      /cancel that/i,
      /update/i
    ];

    if (contextualPatterns.some(pattern => pattern.test(line))) {
      // Find the most recent command in history
      const lastCommand = this.findLastCommand(context.previousMessages);
      if (lastCommand) {
        const ticketId = this.extractTicketId(line) || lastCommand.ticketId;
        const newValue = this.extractNewValue(line, lastCommand.type);
        
        if (ticketId && newValue) {
          return {
            type: lastCommand.type,
            ticketId,
            value: newValue,
            confidence: 0.8,
            originalText: line
          };
        }
      }
    }

    return null;
  }

  private extractTicketId(text: string): string | null {
    const match = text.match(this.ticketIdPattern);
    return match ? match[0] : null;
  }

  private extractStatus(text: string): string | null {
    const match = text.match(this.statusPattern);
    return match ? match[0] : null;
  }

  private extractUser(text: string): string | null {
    const match = text.match(this.userPattern);
    if (match) {
      return match[0].startsWith('@') ? match[0].substring(1) : match[0];
    }
    return null;
  }

  private extractComment(text: string): string | null {
    const colonIndex = text.indexOf(':');
    if (colonIndex === -1) return null;
    return text.substring(colonIndex + 1).trim();
  }

  private extractNewValue(text: string, commandType: string): string | null {
    switch (commandType) {
      case 'status_change':
        return this.extractStatus(text);
      case 'reassign':
        return this.extractUser(text);
      case 'comment':
        return this.extractComment(text);
      default:
        return null;
    }
  }

  private normalizeStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'backlog': 'backlog',
      'unstarted': 'unstarted',
      'in-progress': 'started',
      'started': 'started',
      'completed': 'completed',
      'canceled': 'canceled',
      'cancelled': 'canceled'
    };

    return statusMap[status.toLowerCase()] || status.toLowerCase();
  }

  private findLastCommand(messages: MessageHistory[]): { ticketId: string; type: string } | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const ticketId = this.extractTicketId(messages[i].content);
      if (ticketId) {
        const lowerContent = messages[i].content.toLowerCase();
        if (lowerContent.includes('move') || lowerContent.includes('status')) {
          return { ticketId, type: 'status_change' };
        } else if (lowerContent.includes('reassign') || lowerContent.includes('assign')) {
          return { ticketId, type: 'reassign' };
        } else if (lowerContent.includes('comment')) {
          return { ticketId, type: 'comment' };
        }
      }
    }
    return null;
  }

  private commandToModification(command: ParsedCommand, userId: string): PlanModification {
    return {
      ticketId: command.ticketId || 'ALL',
      action: command.type === 'status_change' ? 'status_change' : 
              command.type === 'reassign' ? 'reassign' : 'comment',
      value: command.value || '',
      userId,
      timestamp: new Date(),
      originalMessage: command.originalText
    };
  }

  async validateAdvancedModifications(
    modifications: PlanModification[],
    availableTickets: LinearIssue[],
    availableUsers: LinearUser[],
    permissions?: UserPermissions
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const validModifications: PlanModification[] = [];

    // Check for conflicts
    const conflicts = this.detectConflicts(modifications);
    if (conflicts.length > 0) {
      errors.push(`Conflicting modifications detected: ${conflicts.join(', ')}`);
    }

    // Check permissions
    if (permissions) {
      const permissionErrors = this.checkPermissions(modifications, permissions);
      errors.push(...permissionErrors);
    }

    for (const modification of modifications) {
      const validation = await this.validateModification(modification, availableTickets, availableUsers);
      
      if (validation.isValid) {
        validModifications.push(modification);
      } else {
        errors.push(...validation.errors);
      }
      
      warnings.push(...validation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      modifications: validModifications
    };
  }

  private detectConflicts(modifications: PlanModification[]): string[] {
    const conflicts: string[] = [];
    const ticketActions = new Map<string, Map<string, PlanModification[]>>();

    for (const mod of modifications) {
      if (mod.ticketId === 'ALL') continue;
      
      if (!ticketActions.has(mod.ticketId)) {
        ticketActions.set(mod.ticketId, new Map());
      }
      
      const actions = ticketActions.get(mod.ticketId)!;
      if (!actions.has(mod.action)) {
        actions.set(mod.action, []);
      }
      
      actions.get(mod.action)!.push(mod);
    }

    // Check for conflicts
    for (const [ticketId, actions] of ticketActions) {
      for (const [action, mods] of actions) {
        if (mods.length > 1) {
          conflicts.push(`${ticketId}: conflicting ${action} modifications`);
        }
      }
    }

    return conflicts;
  }

  private checkPermissions(modifications: PlanModification[], permissions: UserPermissions): string[] {
    const errors: string[] = [];

    for (const mod of modifications) {
      if (!permissions.allowedUsers.includes(mod.userId)) {
        errors.push(`User ${mod.userId} does not have permission to modify plans`);
        continue;
      }

      switch (mod.action) {
        case 'status_change':
          if (!permissions.canChangeStatus) {
            errors.push(`User ${mod.userId} does not have permission to change ticket status`);
          }
          break;
        case 'reassign':
          if (!permissions.canReassign) {
            errors.push(`User ${mod.userId} does not have permission to reassign tickets`);
          }
          break;
        case 'comment':
          if (!permissions.canAddComments) {
            errors.push(`User ${mod.userId} does not have permission to add comments`);
          }
          break;
      }
    }

    return errors;
  }

  private async validateModification(
    modification: PlanModification,
    availableTickets: LinearIssue[],
    availableUsers: LinearUser[]
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate ticket ID
    if (modification.ticketId !== 'ALL') {
      const ticket = availableTickets.find(t => t.identifier === modification.ticketId);
      if (!ticket) {
        // Suggest similar ticket IDs
        const suggestions = this.findSimilarTicketIds(modification.ticketId, availableTickets);
        if (suggestions.length > 0) {
          errors.push(`Ticket ${modification.ticketId} not found. Did you mean: ${suggestions.join(', ')}?`);
        } else {
          errors.push(`Ticket ${modification.ticketId} not found`);
        }
      }
    }

    // Validate action-specific requirements
    switch (modification.action) {
      case 'status_change':
        if (!this.isValidStatus(modification.value)) {
          errors.push(`Invalid status: ${modification.value}`);
        }
        break;

      case 'reassign':
        if (!this.isValidUser(modification.value, availableUsers)) {
          errors.push(`Invalid user: ${modification.value}`);
          
          // Suggest similar users
          const suggestions = this.findSimilarUsers(modification.value, availableUsers);
          if (suggestions.length > 0) {
            errors.push(`Did you mean: ${suggestions.join(', ')}?`);
          }
        }
        break;

      case 'comment':
        if (!modification.value || modification.value.trim().length === 0) {
          errors.push('Comment cannot be empty');
        }
        break;

      default:
        errors.push(`Invalid action: ${modification.action}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private isValidStatus(status: string): boolean {
    const validStatuses = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
    return validStatuses.includes(status.toLowerCase());
  }

  private isValidUser(user: string, availableUsers: LinearUser[]): boolean {
    return availableUsers.some(availableUser => 
      availableUser.email.toLowerCase() === user.toLowerCase() ||
      availableUser.email.toLowerCase().includes(user.toLowerCase()) ||
      (availableUser.displayName && availableUser.displayName.toLowerCase().includes(user.toLowerCase()))
    );
  }

  private findSimilarTicketIds(ticketId: string, availableTickets: LinearIssue[]): string[] {
    const suggestions: string[] = [];
    const targetId = ticketId.toLowerCase();
    
    for (const ticket of availableTickets) {
      const similarity = this.calculateSimilarity(targetId, ticket.identifier.toLowerCase());
      if (similarity > 0.6) {
        suggestions.push(ticket.identifier);
      }
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  private findSimilarUsers(user: string, availableUsers: LinearUser[]): string[] {
    const suggestions: string[] = [];
    const targetUser = user.toLowerCase();
    
    for (const availableUser of availableUsers) {
      const emailSimilarity = this.calculateSimilarity(targetUser, availableUser.email.toLowerCase());
      const nameSimilarity = this.calculateSimilarity(targetUser, availableUser.displayName.toLowerCase());
      
      if (emailSimilarity > 0.6 || nameSimilarity > 0.6) {
        suggestions.push(availableUser.email);
      }
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
  }

  private isAmbiguousCommand(line: string): boolean {
    const lowerLine = line.toLowerCase();
    return (
      (lowerLine.includes('move') && !this.extractTicketId(line)) ||
      (lowerLine.includes('reassign') && !this.extractTicketId(line)) ||
      (lowerLine.includes('ticket') && !this.extractTicketId(line))
    );
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  async getUserGuidance(request: string, context: CommandContext): Promise<UserGuidance> {
    const lowerRequest = request.toLowerCase();
    
    if (lowerRequest.includes('move') || lowerRequest.includes('status')) {
      return {
        type: 'help',
        content: 'To move tickets to different statuses, use: "Move [ticket-id] to [status]"',
        examples: [
          'Move PROJ-123 to in-progress',
          'Move PROJ-456 to completed',
          'Move PROJ-789 to backlog'
        ],
        relatedCommands: ['reassign', 'comment']
      };
    }
    
    if (lowerRequest.includes('help with moving tickets')) {
      return {
        type: 'help',
        content: 'To move tickets to different statuses, use: "Move [ticket-id] to [status]"',
        examples: [
          'Move PROJ-123 to in-progress',
          'Move PROJ-456 to completed',
          'Move PROJ-789 to backlog'
        ],
        relatedCommands: ['reassign', 'comment']
      };
    }
    
    if (lowerRequest.includes('reassign') || lowerRequest.includes('assign')) {
      return {
        type: 'help',
        content: 'To reassign tickets, use: "Reassign [ticket-id] to [user-email]"',
        examples: [
          'Reassign PROJ-123 to john.doe@example.com',
          'Reassign PROJ-456 to jane.doe@example.com'
        ],
        relatedCommands: ['move', 'comment']
      };
    }
    
    if (lowerRequest.includes('comment')) {
      return {
        type: 'help',
        content: 'To add comments to tickets, use: "Add comment to [ticket-id]: [your comment]"',
        examples: [
          'Add comment to PROJ-123: Starting work on this today',
          'Add comment to PROJ-456: Need more information'
        ],
        relatedCommands: ['move', 'reassign']
      };
    }
    
    if (lowerRequest.includes('examples')) {
      const availableTickets = context.availableTickets.slice(0, 3).map(t => t.identifier);
      return {
        type: 'help',
        content: 'Here are some examples using your available tickets:',
        examples: [
          `Move ${availableTickets[0] || 'PROJ-123'} to in-progress`,
          `Reassign ${availableTickets[1] || 'PROJ-456'} to john.doe@example.com`,
          `Add comment to ${availableTickets[2] || 'PROJ-789'}: Starting work on this today`
        ].concat(availableTickets),
        relatedCommands: ['move', 'reassign', 'comment']
      };
    }
    
    // Default help
    return {
      type: 'help',
      content: 'Available commands for managing execution plans:',
      examples: [
        'Move PROJ-123 to in-progress',
        'Reassign PROJ-456 to john.doe@example.com',
        'Add comment to PROJ-789: Starting work on this today',
        'Confirm'
      ],
      relatedCommands: ['move', 'reassign', 'comment', 'confirm']
    };
  }

  private generateSuggestion(error: string, context: CommandContext): string | undefined {
    if (error.includes('not found')) {
      return `Available tickets: ${context.availableTickets.slice(0, 3).map(t => t.identifier).join(', ')}`;
    }
    if (error.includes('Invalid user')) {
      return `Available users: ${context.availableUsers.slice(0, 3).join(', ')}`;
    }
    if (error.includes('ticket ID')) {
      return `Try: Move PROJ-123 to in-progress`;
    }
    return undefined;
  }

  private async generateGuidance(
    message: string, 
    context: CommandContext, 
    errors: ValidationError[]
  ): Promise<UserGuidance> {
    if (errors.length > 0) {
      return {
        type: 'error',
        content: 'I found some issues with your request. Here are some suggestions:',
        examples: context.availableTickets.slice(0, 3).map(t => t.identifier),
        relatedCommands: ['help']
      };
    }
    
    // Check for incomplete commands
    if (message.toLowerCase().includes('move') && !this.extractTicketId(message)) {
      return {
        type: 'suggestion',
        content: 'I see you want to move a ticket, but I need a ticket ID. Try:',
        examples: [
          'Move PROJ-123 to in-progress',
          'Move PROJ-456 to completed'
        ],
        relatedCommands: ['help']
      };
    }
    
    return {
      type: 'suggestion',
      content: 'I didn\'t understand your request. Try one of these commands:',
      examples: [
        'Move PROJ-123 to in-progress',
        'Reassign PROJ-456 to john.doe@example.com',
        'Add comment to PROJ-789: Your comment here'
      ],
      relatedCommands: ['help']
    };
  }
}

// Factory function to create an advanced reply processor
export function createAdvancedReplyProcessor(): AdvancedReplyProcessor {
  return new AdvancedReplyProcessor();
}