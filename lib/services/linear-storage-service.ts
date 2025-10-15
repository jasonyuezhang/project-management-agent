import { LinearMCPClient } from '../mcp/linear-client.js';
import { ExecutionPlan, ExecutionPlanMetadata, LinearCustomFieldValue } from '../mcp/types.js';
import { logger } from '../monitoring/logger.js';

export interface LinearStorageConfig {
  customFieldIds: {
    executionPlanId: string;
    lastPlanDate: string;
  };
  teamId: string;
  enableComments: boolean;
  enableCustomFields: boolean;
}

export interface StorageResult {
  success: boolean;
  planId: string;
  ticketsUpdated: number;
  commentsAdded: number;
  customFieldsUpdated: number;
  errors: string[];
}

export class LinearStorageService {
  private linearClient: LinearMCPClient;
  private config: LinearStorageConfig;

  constructor(linearClient: LinearMCPClient, config: LinearStorageConfig) {
    this.linearClient = linearClient;
    this.config = config;
  }

  /**
   * Store execution plan data in Linear using custom fields and comments
   */
  async storeExecutionPlan(plan: ExecutionPlan): Promise<StorageResult> {
    const result: StorageResult = {
      success: true,
      planId: plan.planId,
      ticketsUpdated: 0,
      commentsAdded: 0,
      customFieldsUpdated: 0,
      errors: [],
    };

    try {
      logger.info(`Storing execution plan ${plan.planId} in Linear`, {
        userId: plan.userId,
        ticketCount: plan.tickets.finished.length + plan.tickets.inProgress.length + plan.tickets.open.length,
      });

      // Ensure custom field definitions exist
      if (this.config.enableCustomFields) {
        try {
          await this.linearClient.ensureCustomFieldDefinitions(this.config.teamId, this.config.customFieldIds);
        } catch (error) {
          const errorMsg = `Failed to ensure custom field definitions: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg, { planId: plan.planId });
        }
      }

      // Store execution plan comments on all tickets
      if (this.config.enableComments) {
        try {
          await this.linearClient.storeExecutionPlanComments(plan);
          result.commentsAdded = plan.tickets.finished.length + plan.tickets.inProgress.length + plan.tickets.open.length;
          logger.info(`Added execution plan comments to ${result.commentsAdded} tickets`, { planId: plan.planId });
        } catch (error) {
          const errorMsg = `Failed to store execution plan comments: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg, { planId: plan.planId });
        }
      }

      // Store execution plan metadata in custom fields
      if (this.config.enableCustomFields) {
        try {
          await this.linearClient.storeExecutionPlanMetadata(plan, this.config.customFieldIds);
          result.customFieldsUpdated = 1; // One metadata entry per plan
          logger.info(`Stored execution plan metadata`, { planId: plan.planId });
        } catch (error) {
          const errorMsg = `Failed to store execution plan metadata: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMsg);
          logger.error(errorMsg, { planId: plan.planId });
        }
      }

      result.ticketsUpdated = result.commentsAdded;
      result.success = result.errors.length === 0;

      logger.info(`Execution plan storage completed`, {
        planId: plan.planId,
        success: result.success,
        ticketsUpdated: result.ticketsUpdated,
        commentsAdded: result.commentsAdded,
        customFieldsUpdated: result.customFieldsUpdated,
        errorCount: result.errors.length,
      });

      return result;
    } catch (error) {
      const errorMsg = `Failed to store execution plan: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      result.success = false;
      logger.error(errorMsg, { planId: plan.planId, error });
      return result;
    }
  }

  /**
   * Store multiple execution plans in batch
   */
  async storeExecutionPlans(plans: ExecutionPlan[]): Promise<StorageResult[]> {
    logger.info(`Storing ${plans.length} execution plans in Linear`, {
      teamId: this.config.teamId,
    });

    const results: StorageResult[] = [];

    for (const plan of plans) {
      try {
        const result = await this.storeExecutionPlan(plan);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to store execution plan ${plan.planId}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.push({
          success: false,
          planId: plan.planId,
          ticketsUpdated: 0,
          commentsAdded: 0,
          customFieldsUpdated: 0,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info(`Batch storage completed`, {
      total: plans.length,
      successful,
      failed,
    });

    return results;
  }

  /**
   * Retrieve execution plan metadata from Linear
   */
  async getExecutionPlanMetadata(ticketId: string): Promise<ExecutionPlanMetadata | null> {
    try {
      const metadata = await this.linearClient.getExecutionPlanMetadata(ticketId, this.config.customFieldIds);
      
      if (!metadata.planId || !metadata.lastPlanDate) {
        return null;
      }

      return {
        planId: metadata.planId,
        lastPlanDate: metadata.lastPlanDate,
        userId: '', // Would need to be retrieved separately
        userName: '', // Would need to be retrieved separately
        ticketCount: 0, // Would need to be calculated
        completedCount: 0,
        inProgressCount: 0,
        openCount: 0,
      };
    } catch (error) {
      logger.error(`Failed to retrieve execution plan metadata for ticket ${ticketId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Search for tickets with specific execution plan metadata
   */
  async findTicketsByExecutionPlan(planId: string): Promise<string[]> {
    try {
      // This would require a more sophisticated search implementation
      // For now, we'll return an empty array as this would need custom Linear query capabilities
      logger.warn('findTicketsByExecutionPlan not fully implemented - requires custom Linear query capabilities');
      return [];
    } catch (error) {
      logger.error(`Failed to find tickets by execution plan ${planId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Clean up old execution plan data
   */
  async cleanupOldExecutionPlans(olderThanDays: number = 30): Promise<{ cleaned: number; errors: string[] }> {
    const result = { cleaned: 0, errors: [] };
    
    try {
      logger.info(`Cleaning up execution plans older than ${olderThanDays} days`);
      
      // This would require implementing cleanup logic based on custom field values
      // For now, we'll log that this feature needs implementation
      logger.warn('cleanupOldExecutionPlans not fully implemented - requires custom Linear query and update capabilities');
      
      return result;
    } catch (error) {
      const errorMsg = `Failed to cleanup old execution plans: ${error instanceof Error ? error.message : 'Unknown error'}`;
      result.errors.push(errorMsg);
      logger.error(errorMsg, { olderThanDays });
      return result;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalPlansStored: number;
    totalCommentsAdded: number;
    totalCustomFieldsUpdated: number;
    lastCleanupDate?: string;
  }> {
    try {
      // This would require implementing statistics collection
      // For now, we'll return basic stats
      logger.warn('getStorageStats not fully implemented - requires custom Linear query capabilities');
      
      return {
        totalPlansStored: 0,
        totalCommentsAdded: 0,
        totalCustomFieldsUpdated: 0,
      };
    } catch (error) {
      logger.error('Failed to get storage statistics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        totalPlansStored: 0,
        totalCommentsAdded: 0,
        totalCustomFieldsUpdated: 0,
      };
    }
  }
}

/**
 * Factory function to create a LinearStorageService instance
 */
export function createLinearStorageService(
  linearClient: LinearMCPClient,
  config: LinearStorageConfig
): LinearStorageService {
  return new LinearStorageService(linearClient, config);
}
