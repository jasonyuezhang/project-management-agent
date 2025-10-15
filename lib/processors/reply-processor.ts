import { PlanModification, ValidationResult } from '../mcp/slack-types.js';
import { LinearIssue } from '../mcp/types.js';

export class ReplyProcessor {
  private ticketIdPattern = /([A-Z]+-\d+)/g;
  private statusPattern = /(backlog|unstarted|in-progress|started|completed|canceled)/gi;
  private userPattern = /@?([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/g;

  async parseUserReply(reply: string, userId: string): Promise<PlanModification[]> {
    const modifications: PlanModification[] = [];
    const lines = reply.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    for (const line of lines) {
      const modification = this.parseLine(line, userId);
      if (modification) {
        modifications.push(modification);
      }
    }

    return modifications;
  }

  private parseLine(line: string, userId: string): PlanModification | null {
    const lowerLine = line.toLowerCase();

    // Check for status change
    if (lowerLine.includes('move') && lowerLine.includes('to')) {
      return this.parseStatusChange(line, userId);
    }

    // Check for reassignment
    if (lowerLine.includes('reassign') && lowerLine.includes('to')) {
      return this.parseReassignment(line, userId);
    }

    // Check for comment
    if (lowerLine.includes('add comment') || lowerLine.includes('comment')) {
      return this.parseComment(line, userId);
    }

    // Check for simple confirmations
    if (lowerLine.includes('confirm') || lowerLine === 'yes' || lowerLine === 'y') {
      return {
        ticketId: 'ALL',
        action: 'comment',
        value: 'Plan confirmed by user',
        userId,
        timestamp: new Date(),
        originalMessage: line
      };
    }

    return null;
  }

  private parseStatusChange(line: string, userId: string): PlanModification | null {
    const ticketIdMatch = line.match(this.ticketIdPattern);
    const statusMatch = line.match(this.statusPattern);

    if (!ticketIdMatch || !statusMatch) {
      return null;
    }

    const ticketId = ticketIdMatch[0];
    const status = this.normalizeStatus(statusMatch[0]);

    return {
      ticketId,
      action: 'status_change',
      value: status,
      userId,
      timestamp: new Date(),
      originalMessage: line
    };
  }

  private parseReassignment(line: string, userId: string): PlanModification | null {
    const ticketIdMatch = line.match(this.ticketIdPattern);
    const userMatch = line.match(this.userPattern);

    if (!ticketIdMatch || !userMatch) {
      return null;
    }

    const ticketId = ticketIdMatch[0];
    const user = userMatch[0].startsWith('@') ? userMatch[0].substring(1) : userMatch[0];

    return {
      ticketId,
      action: 'reassign',
      value: user,
      userId,
      timestamp: new Date(),
      originalMessage: line
    };
  }

  private parseComment(line: string, userId: string): PlanModification | null {
    const ticketIdMatch = line.match(this.ticketIdPattern);
    
    if (!ticketIdMatch) {
      return null;
    }

    const ticketId = ticketIdMatch[0];
    
    // Extract comment text after the colon
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      return null;
    }

    const comment = line.substring(colonIndex + 1).trim();

    return {
      ticketId,
      action: 'comment',
      value: comment,
      userId,
      timestamp: new Date(),
      originalMessage: line
    };
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

  async validateModifications(
    modifications: PlanModification[],
    availableTickets: LinearIssue[],
    availableUsers: string[]
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const validModifications: PlanModification[] = [];

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

  private async validateModification(
    modification: PlanModification,
    availableTickets: LinearIssue[],
    availableUsers: string[]
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate ticket ID
    if (modification.ticketId !== 'ALL') {
      const ticket = availableTickets.find(t => t.identifier === modification.ticketId);
      if (!ticket) {
        errors.push(`Ticket ${modification.ticketId} not found`);
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

  private isValidUser(user: string, availableUsers: string[]): boolean {
    return availableUsers.some(availableUser => 
      availableUser.toLowerCase() === user.toLowerCase() ||
      availableUser.toLowerCase().includes(user.toLowerCase())
    );
  }

  // Helper method to extract ticket IDs from a message
  extractTicketIds(message: string): string[] {
    const matches = message.match(this.ticketIdPattern);
    return matches || [];
  }

  // Helper method to check if a message contains any modifications
  containsModifications(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes('move') ||
      lowerMessage.includes('reassign') ||
      lowerMessage.includes('comment') ||
      lowerMessage.includes('confirm') ||
      lowerMessage === 'yes' ||
      lowerMessage === 'y'
    );
  }

  // Helper method to format modifications for display
  formatModifications(modifications: PlanModification[]): string {
    if (modifications.length === 0) {
      return 'No modifications found';
    }

    const formatted = modifications.map(mod => {
      switch (mod.action) {
        case 'status_change':
          return `• Move ${mod.ticketId} to ${mod.value}`;
        case 'reassign':
          return `• Reassign ${mod.ticketId} to ${mod.value}`;
        case 'comment':
          return `• Add comment to ${mod.ticketId}: ${mod.value}`;
        default:
          return `• ${mod.action} for ${mod.ticketId}: ${mod.value}`;
      }
    });

    return formatted.join('\n');
  }
}

// Factory function to create a reply processor
export function createReplyProcessor(): ReplyProcessor {
  return new ReplyProcessor();
}