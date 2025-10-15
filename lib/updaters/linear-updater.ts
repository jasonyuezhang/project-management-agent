import { LinearMCPClient } from '../mcp/linear-client.js';
import { PlanModification, ExecutionPlan } from '../mcp/types.js';
import { logger } from '../monitoring/logger.js';

export interface UpdateResult {
  ticketId: string;
  action: string;
  success: boolean;
  error?: string;
  timestamp: Date;
  originalModification: PlanModification;
}

export interface BatchUpdateResult {
  sessionId: string;
  totalModifications: number;
  successfulUpdates: number;
  failedUpdates: number;
  results: UpdateResult[];
  completedAt: Date;
  errors: string[];
}

export interface UpdateOptions {
  retryAttempts?: number;
  retryDelay?: number;
  validateBeforeUpdate?: boolean;
  dryRun?: boolean;
  batchSize?: number;
}

export class LinearUpdater {
  private linearClient: LinearMCPClient;
  private options: Required<UpdateOptions>;

  constructor(linearClient: LinearMCPClient, options: UpdateOptions = {}) {
    this.linearClient = linearClient;
    this.options = {
      retryAttempts: 3,
      retryDelay: 1000,
      validateBeforeUpdate: true,
      dryRun: false,
      batchSize: 10,
      ...options,
    };
  }

  /**
   * Apply a single modification to a Linear ticket
   */
  async applyModification(modification: PlanModification): Promise<UpdateResult> {
    const startTime = new Date();
    
    try {
      logger.info(`Applying modification to ticket ${modification.ticketId}`, {
        action: modification.action,
        value: modification.value,
        userId: modification.userId,
      });

      if (this.options.dryRun) {
        logger.info(`Dry run: Would apply modification to ticket ${modification.ticketId}`);
        return {
          ticketId: modification.ticketId,
          action: modification.action,
          success: true,
          timestamp: startTime,
          originalModification: modification,
        };
      }

      // Validate modification if enabled
      if (this.options.validateBeforeUpdate) {
        await this.validateModification(modification);
      }

      // Apply the modification based on action type
      let success = false;
      let error: string | undefined;

      try {
        switch (modification.action) {
          case 'status_change':
            await this.updateTicketStatus(modification.ticketId, modification.value);
            success = true;
            break;
          case 'reassign':
            await this.updateTicketAssignee(modification.ticketId, modification.value);
            success = true;
            break;
          case 'comment':
            await this.addTicketComment(modification.ticketId, modification.value);
            success = true;
            break;
          default:
            throw new Error(`Unknown action type: ${modification.action}`);
        }
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error occurred';
        logger.error(`Failed to apply modification to ticket ${modification.ticketId}`, {
          action: modification.action,
          error,
        });
      }

      return {
        ticketId: modification.ticketId,
        action: modification.action,
        success,
        error,
        timestamp: startTime,
        originalModification: modification,
      };
    } catch (error) {
      logger.error(`Error applying modification to ticket ${modification.ticketId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        modification,
      });

      return {
        ticketId: modification.ticketId,
        action: modification.action,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        timestamp: startTime,
        originalModification: modification,
      };
    }
  }

  /**
   * Apply multiple modifications in batch
   */
  async applyModifications(
    modifications: PlanModification[],
    sessionId: string
  ): Promise<BatchUpdateResult> {
    const startTime = new Date();
    const results: UpdateResult[] = [];
    const errors: string[] = [];

    logger.info(`Starting batch update for session ${sessionId}`, {
      totalModifications: modifications.length,
      batchSize: this.options.batchSize,
    });

    // Process modifications in batches
    const batches = this.createBatches(modifications, this.options.batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.info(`Processing batch ${i + 1}/${batches.length}`, {
        batchSize: batch.length,
        sessionId,
      });

      // Process batch concurrently
      const batchPromises = batch.map(modification => 
        this.applyModificationWithRetry(modification)
      );

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (!result.value.success && result.value.error) {
              errors.push(result.value.error);
            }
          } else {
            const modification = batch[index];
            const error = result.reason instanceof Error ? result.reason.message : 'Unknown error';
            errors.push(`Failed to process modification for ticket ${modification.ticketId}: ${error}`);
            
            results.push({
              ticketId: modification.ticketId,
              action: modification.action,
              success: false,
              error,
              timestamp: new Date(),
              originalModification: modification,
            });
          }
        });
      } catch (error) {
        const errorMessage = `Batch processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        logger.error(errorMessage, { sessionId, batchIndex: i });
      }

      // Add delay between batches to avoid rate limiting
      if (i < batches.length - 1) {
        await this.delay(this.options.retryDelay);
      }
    }

    const successfulUpdates = results.filter(r => r.success).length;
    const failedUpdates = results.filter(r => !r.success).length;

    logger.info(`Batch update completed for session ${sessionId}`, {
      totalModifications: modifications.length,
      successfulUpdates,
      failedUpdates,
      duration: Date.now() - startTime.getTime(),
    });

    return {
      sessionId,
      totalModifications: modifications.length,
      successfulUpdates,
      failedUpdates,
      results,
      completedAt: new Date(),
      errors,
    };
  }

  /**
   * Create execution plan comment on a ticket
   */
  async createExecutionPlanComment(ticketId: string, plan: ExecutionPlan): Promise<void> {
    try {
      const comment = this.formatExecutionPlanComment(plan);
      const resolvedTicketId = await this.resolveTicketId(ticketId);
      await this.linearClient.addTicketComment(resolvedTicketId, comment);
      
      logger.info(`Created execution plan comment on ticket ${ticketId}`, {
        planId: plan.planId,
        userId: plan.userId,
      });
    } catch (error) {
      logger.error(`Failed to create execution plan comment on ticket ${ticketId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        planId: plan.planId,
      });
      throw error;
    }
  }

  /**
   * Update ticket status with retry logic
   */
  private async updateTicketStatus(ticketId: string, status: string): Promise<void> {
    const statusMapping = this.getStatusMapping();
    const linearStatus = statusMapping[status.toLowerCase()] || status;
    
    // Resolve ticket ID if it's an identifier
    const resolvedTicketId = await this.resolveTicketId(ticketId);
    
    await this.linearClient.updateTicketStatus(resolvedTicketId, linearStatus);
    
    logger.info(`Updated ticket ${ticketId} status to ${linearStatus}`);
  }

  /**
   * Update ticket assignee with retry logic
   */
  private async updateTicketAssignee(ticketId: string, assigneeEmail: string): Promise<void> {
    // First, get the user ID from email
    const users = await this.linearClient.getUsers();
    const user = users.find(u => u.email === assigneeEmail);
    
    if (!user) {
      throw new Error(`User not found with email: ${assigneeEmail}`);
    }

    // Resolve ticket ID if it's an identifier
    const resolvedTicketId = await this.resolveTicketId(ticketId);

    await this.linearClient.updateTicketAssignee(resolvedTicketId, user.id);
    
    logger.info(`Updated ticket ${ticketId} assignee to ${assigneeEmail} (${user.id})`);
  }

  /**
   * Add ticket comment with retry logic
   */
  private async addTicketComment(ticketId: string, comment: string): Promise<void> {
    // Resolve ticket ID if it's an identifier
    const resolvedTicketId = await this.resolveTicketId(ticketId);
    
    await this.linearClient.addTicketComment(resolvedTicketId, comment);
    
    logger.info(`Added comment to ticket ${ticketId}`, {
      commentLength: comment.length,
    });
  }

  /**
   * Apply modification with retry logic
   */
  private async applyModificationWithRetry(modification: PlanModification): Promise<UpdateResult> {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        // Validate modification if enabled
        if (this.options.validateBeforeUpdate) {
          await this.validateModification(modification);
        }

        // Apply the modification based on action type
        let success = false;
        let error: string | undefined;

        try {
          switch (modification.action) {
            case 'status_change':
              await this.updateTicketStatus(modification.ticketId, modification.value);
              success = true;
              break;
            case 'reassign':
              await this.updateTicketAssignee(modification.ticketId, modification.value);
              success = true;
              break;
            case 'comment':
              await this.addTicketComment(modification.ticketId, modification.value);
              success = true;
              break;
            default:
              throw new Error(`Invalid action type: ${modification.action}`);
          }
        } catch (err) {
          error = err instanceof Error ? err.message : 'Unknown error occurred';
          logger.error(`Failed to apply modification to ticket ${modification.ticketId}`, {
            action: modification.action,
            error,
          });
        }

        if (success) {
          return {
            ticketId: modification.ticketId,
            action: modification.action,
            success: true,
            timestamp: new Date(),
            originalModification: modification,
          };
        }

        lastError = new Error(error || 'Unknown error');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }

      if (attempt < this.options.retryAttempts) {
        const delay = this.options.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        logger.warn(`Retry attempt ${attempt} failed for ticket ${modification.ticketId}, retrying in ${delay}ms`, {
          error: lastError.message,
        });
        await this.delay(delay);
      }
    }

    // All retry attempts failed
    return {
      ticketId: modification.ticketId,
      action: modification.action,
      success: false,
      error: lastError?.message || 'All retry attempts failed',
      timestamp: new Date(),
      originalModification: modification,
    };
  }

  /**
   * Resolve ticket ID from identifier if needed
   */
  private async resolveTicketId(ticketIdOrIdentifier: string): Promise<string> {
    // First try to get by ID directly
    let ticket = await this.linearClient.getTicketById(ticketIdOrIdentifier);
    
    if (ticket) {
      return ticketIdOrIdentifier; // It's already an ID
    }
    
    // Try to find by identifier
    const allTickets = await this.linearClient.getTicketsByFilter({});
    ticket = allTickets.find(t => t.identifier === ticketIdOrIdentifier) || null;
    
    if (ticket) {
      return ticket.id;
    }
    
    throw new Error(`Ticket ${ticketIdOrIdentifier} not found`);
  }

  /**
   * Get ticket by ID or identifier
   */
  private async getTicketByIdOrIdentifier(ticketIdOrIdentifier: string): Promise<any> {
    // First try to get by ID directly
    let ticket = await this.linearClient.getTicketById(ticketIdOrIdentifier);
    
    if (ticket) {
      return ticket;
    }
    
    // Try to find by identifier
    const allTickets = await this.linearClient.getTicketsByFilter({});
    ticket = allTickets.find(t => t.identifier === ticketIdOrIdentifier) || null;
    
    return ticket;
  }

  /**
   * Validate modification before applying
   */
  private async validateModification(modification: PlanModification): Promise<void> {
    // Get the ticket to validate it exists and is in a valid state
    const ticket = await this.getTicketByIdOrIdentifier(modification.ticketId);
    
    if (!ticket) {
      throw new Error(`Ticket ${modification.ticketId} not found`);
    }

    // Validate action-specific requirements
    switch (modification.action) {
      case 'status_change':
        this.validateStatusChange(ticket, modification.value);
        break;
      case 'reassign':
        await this.validateReassignment(modification.value);
        break;
      case 'comment':
        this.validateComment(modification.value);
        break;
      default:
        throw new Error(`Invalid action type: ${modification.action}`);
    }
  }

  /**
   * Validate status change
   */
  private validateStatusChange(ticket: any, newStatus: string): void {
    const validStatuses = ['backlog', 'unstarted', 'started', 'completed', 'canceled'];
    const statusMapping = this.getStatusMapping();
    const linearStatus = statusMapping[newStatus.toLowerCase()];
    
    if (!linearStatus || !validStatuses.includes(linearStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Valid statuses: ${validStatuses.join(', ')}`);
    }
  }

  /**
   * Validate reassignment
   */
  private async validateReassignment(assigneeEmail: string): Promise<void> {
    const users = await this.linearClient.getUsers();
    const user = users.find(u => u.email === assigneeEmail);
    
    if (!user) {
      throw new Error(`User not found with email: ${assigneeEmail}`);
    }
  }

  /**
   * Validate comment
   */
  private validateComment(comment: string): void {
    if (!comment || comment.trim().length === 0) {
      throw new Error('Comment cannot be empty');
    }
    
    if (comment.length > 10000) {
      throw new Error('Comment is too long (max 10000 characters)');
    }
  }

  /**
   * Create batches from modifications array
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get status mapping from user-friendly names to Linear statuses
   */
  private getStatusMapping(): Record<string, string> {
    return {
      'backlog': 'backlog',
      'todo': 'unstarted',
      'unstarted': 'unstarted',
      'in-progress': 'started',
      'started': 'started',
      'in progress': 'started',
      'completed': 'completed',
      'done': 'completed',
      'finished': 'completed',
      'canceled': 'canceled',
      'cancelled': 'canceled',
    };
  }

  /**
   * Format execution plan comment
   */
  private formatExecutionPlanComment(plan: ExecutionPlan): string {
    const date = plan.generatedAt.toLocaleDateString();
    const time = plan.generatedAt.toLocaleTimeString();
    
    return `📋 **Execution Plan - ${date} at ${time}**

**Summary**: ${plan.summary}

**Completed Tickets** (${plan.tickets.finished.length}):
${plan.tickets.finished.map(ticket => `✅ ${ticket.identifier}: ${ticket.title}`).join('\n')}

**In Progress** (${plan.tickets.inProgress.length}):
${plan.tickets.inProgress.map(ticket => `🔄 ${ticket.identifier}: ${ticket.title}`).join('\n')}

**Open Tickets** (${plan.tickets.open.length}):
${plan.tickets.open.map(ticket => `📝 ${ticket.identifier}: ${ticket.title}`).join('\n')}

---
*Generated by Project Management Agent*`;
  }
}

/**
 * Factory function to create a LinearUpdater instance
 */
export function createLinearUpdater(
  linearClient: LinearMCPClient,
  options?: UpdateOptions
): LinearUpdater {
  return new LinearUpdater(linearClient, options);
}