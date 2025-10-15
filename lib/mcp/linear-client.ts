import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  LinearUser,
  LinearTeam,
  LinearIssue,
  LinearCustomField,
  TicketStatus,
  TicketFilter,
  ExecutionPlan,
  TeamSummary
} from './types.js';

export interface LinearMCPClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getTicketsByStatus(status: TicketStatus[]): Promise<LinearIssue[]>;
  getTicketsByAssignee(assigneeId: string): Promise<LinearIssue[]>;
  getTicketsByFilter(filter: TicketFilter): Promise<LinearIssue[]>;
  updateTicketStatus(ticketId: string, status: string): Promise<void>;
  updateTicketAssignee(ticketId: string, assigneeId: string): Promise<void>;
  addTicketComment(ticketId: string, comment: string): Promise<void>;
  createCustomField(ticketId: string, field: LinearCustomField): Promise<void>;
  updateCustomField(ticketId: string, fieldId: string, value: string | number | boolean | string[]): Promise<void>;
  getCustomFields(ticketId: string): Promise<LinearCustomFieldValue[]>;
  getCustomFieldDefinitions(teamId?: string): Promise<LinearCustomField[]>;
  getUsers(): Promise<LinearUser[]>;
  getTeams(): Promise<LinearTeam[]>;
  getTicketById(ticketId: string): Promise<LinearIssue | null>;
  generateExecutionPlans(teamId?: string): Promise<ExecutionPlan[]>;
  generateTeamSummary(teamId: string): Promise<TeamSummary>;
  storeExecutionPlanMetadata(plan: ExecutionPlan, customFieldIds: { executionPlanId: string; lastPlanDate: string }): Promise<void>;
  storeExecutionPlanComments(plan: ExecutionPlan): Promise<void>;
  getExecutionPlanMetadata(ticketId: string, customFieldIds: { executionPlanId: string; lastPlanDate: string }): Promise<{ planId?: string; lastPlanDate?: string }>;
  ensureCustomFieldDefinitions(teamId: string, customFieldIds: { executionPlanId: string; lastPlanDate: string }): Promise<void>;
}

export class LinearMCPClientImpl implements LinearMCPClient {
  private client: Client;
  private isConnected: boolean = false;

  constructor() {
    this.client = new Client(
      {
        name: 'project-management-agent',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['@linear/mcp-server'],
        env: {
          LINEAR_API_KEY: process.env.LINEAR_API_KEY || '',
        },
      });

      await this.client.connect(transport);
      this.isConnected = true;
    } catch (error) {
      console.error('Failed to connect to Linear MCP server:', error);
      throw new Error('Failed to connect to Linear MCP server');
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  async getTicketsByStatus(status: TicketStatus[]): Promise<LinearIssue[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_issues_by_status',
        arguments: {
          statuses: status,
        },
      });

      const data = this.parseMCPResponse<{ issues: LinearIssue[] }>(result);
      return data?.issues || [];
    } catch (error) {
      console.error('Error fetching tickets by status:', error);
      throw new Error('Failed to fetch tickets by status');
    }
  }

  async getTicketsByAssignee(assigneeId: string): Promise<LinearIssue[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_issues_by_assignee',
        arguments: {
          assigneeId,
        },
      });

      const data = this.parseMCPResponse<{ issues: LinearIssue[] }>(result);
      return data?.issues || [];
    } catch (error) {
      console.error('Error fetching tickets by assignee:', error);
      throw new Error('Failed to fetch tickets by assignee');
    }
  }

  async getTicketsByFilter(filter: TicketFilter): Promise<LinearIssue[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_issues_by_filter',
        arguments: filter,
      });

      const data = this.parseMCPResponse<{ issues: LinearIssue[] }>(result);
      return data?.issues || [];
    } catch (error) {
      console.error('Error fetching tickets by filter:', error);
      throw new Error('Failed to fetch tickets by filter');
    }
  }

  async updateTicketStatus(ticketId: string, status: string): Promise<void> {
    await this.ensureConnected();
    
    try {
      await this.client.callTool({
        name: 'update_issue_status',
        arguments: {
          issueId: ticketId,
          status,
        },
      });
    } catch (error) {
      console.error('Error updating ticket status:', error);
      throw new Error('Failed to update ticket status');
    }
  }

  async updateTicketAssignee(ticketId: string, assigneeId: string): Promise<void> {
    await this.ensureConnected();
    
    try {
      await this.client.callTool({
        name: 'update_issue_assignee',
        arguments: {
          issueId: ticketId,
          assigneeId,
        },
      });
    } catch (error) {
      console.error('Error updating ticket assignee:', error);
      throw new Error('Failed to update ticket assignee');
    }
  }

  async addTicketComment(ticketId: string, comment: string): Promise<void> {
    await this.ensureConnected();
    
    try {
      await this.client.callTool({
        name: 'add_issue_comment',
        arguments: {
          issueId: ticketId,
          comment,
        },
      });
    } catch (error) {
      console.error('Error adding ticket comment:', error);
      throw new Error('Failed to add ticket comment');
    }
  }

  async createCustomField(ticketId: string, field: LinearCustomField): Promise<void> {
    await this.ensureConnected();
    
    try {
      await this.client.callTool({
        name: 'create_custom_field',
        arguments: {
          issueId: ticketId,
          field,
        },
      });
    } catch (error) {
      console.error('Error creating custom field:', error);
      throw new Error('Failed to create custom field');
    }
  }

  async updateCustomField(ticketId: string, fieldId: string, value: string | number | boolean | string[]): Promise<void> {
    await this.ensureConnected();
    
    try {
      await this.client.callTool({
        name: 'update_custom_field',
        arguments: {
          issueId: ticketId,
          fieldId,
          value,
        },
      });
    } catch (error) {
      console.error('Error updating custom field:', error);
      throw new Error('Failed to update custom field');
    }
  }

  async getCustomFields(ticketId: string): Promise<LinearCustomFieldValue[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_custom_fields',
        arguments: {
          issueId: ticketId,
        },
      });

      const data = this.parseMCPResponse<{ customFields: LinearCustomFieldValue[] }>(result);
      return data?.customFields || [];
    } catch (error) {
      console.error('Error fetching custom fields:', error);
      throw new Error('Failed to fetch custom fields');
    }
  }

  async getCustomFieldDefinitions(teamId?: string): Promise<LinearCustomField[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_custom_field_definitions',
        arguments: teamId ? { teamId } : {},
      });

      const data = this.parseMCPResponse<{ customFields: LinearCustomField[] }>(result);
      return data?.customFields || [];
    } catch (error) {
      console.error('Error fetching custom field definitions:', error);
      throw new Error('Failed to fetch custom field definitions');
    }
  }

  async getUsers(): Promise<LinearUser[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_users',
        arguments: {},
      });

      const data = this.parseMCPResponse<{ users: LinearUser[] }>(result);
      return data?.users || [];
    } catch (error) {
      console.error('Error fetching users:', error);
      throw new Error('Failed to fetch users');
    }
  }

  async getTeams(): Promise<LinearTeam[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_teams',
        arguments: {},
      });

      const data = this.parseMCPResponse<{ teams: LinearTeam[] }>(result);
      return data?.teams || [];
    } catch (error) {
      console.error('Error fetching teams:', error);
      throw new Error('Failed to fetch teams');
    }
  }

  async getTicketById(ticketId: string): Promise<LinearIssue | null> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_issue_by_id',
        arguments: {
          issueId: ticketId,
        },
      });

      const data = this.parseMCPResponse<{ issue: LinearIssue }>(result);
      return data?.issue || null;
    } catch (error) {
      console.error('Error fetching ticket by ID:', error);
      throw new Error('Failed to fetch ticket by ID');
    }
  }

  async generateExecutionPlans(_teamId?: string): Promise<ExecutionPlan[]> {
    await this.ensureConnected();
    
    try {
      // Get all users for the team
      const users = await this.getUsers();
      const plans: ExecutionPlan[] = [];

      for (const user of users) {
        // Get tickets for this user
        const userTickets = await this.getTicketsByAssignee(user.id);
        
        // Categorize tickets by status
        const finished = userTickets.filter(ticket => 
          ticket.state.type === 'completed'
        );
        const inProgress = userTickets.filter(ticket => 
          ticket.state.type === 'started'
        );
        const open = userTickets.filter(ticket => 
          ['backlog', 'unstarted'].includes(ticket.state.type)
        );

        // Generate summary
        const summary = this.generatePlanSummary(finished, inProgress, open);

        const plan: ExecutionPlan = {
          userId: user.id,
          userName: user.displayName,
          tickets: {
            finished,
            inProgress,
            open,
          },
          summary,
          generatedAt: new Date(),
          planId: `plan_${user.id}_${Date.now()}`,
        };

        plans.push(plan);
      }

      return plans;
    } catch (error) {
      console.error('Error generating execution plans:', error);
      throw new Error('Failed to generate execution plans');
    }
  }

  async generateTeamSummary(teamId: string): Promise<TeamSummary> {
    await this.ensureConnected();
    
    try {
      const plans = await this.generateExecutionPlans(teamId);
      const team = await this.getTeams().then(teams => 
        teams.find(t => t.id === teamId)
      );

      if (!team) {
        throw new Error('Team not found');
      }

      const totalTickets = plans.reduce((sum, plan) => 
        sum + plan.tickets.finished.length + plan.tickets.inProgress.length + plan.tickets.open.length, 0
      );
      const completedTickets = plans.reduce((sum, plan) => 
        sum + plan.tickets.finished.length, 0
      );
      const inProgressTickets = plans.reduce((sum, plan) => 
        sum + plan.tickets.inProgress.length, 0
      );
      const openTickets = plans.reduce((sum, plan) => 
        sum + plan.tickets.open.length, 0
      );

      const completionRate = totalTickets > 0 ? (completedTickets / totalTickets) * 100 : 0;

      return {
        teamId,
        teamName: team.name,
        totalTickets,
        completedTickets,
        inProgressTickets,
        openTickets,
        completionRate,
        plans,
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error('Error generating team summary:', error);
      throw new Error('Failed to generate team summary');
    }
  }

  /**
   * Store execution plan metadata in Linear custom fields
   */
  async storeExecutionPlanMetadata(plan: ExecutionPlan, customFieldIds: { executionPlanId: string; lastPlanDate: string }): Promise<void> {
    await this.ensureConnected();
    
    try {
      // Store execution plan ID in custom field
      await this.updateCustomField(plan.tickets.finished[0]?.id || plan.tickets.inProgress[0]?.id || plan.tickets.open[0]?.id, 
        customFieldIds.executionPlanId, plan.planId);
      
      // Store last plan date in custom field
      await this.updateCustomField(plan.tickets.finished[0]?.id || plan.tickets.inProgress[0]?.id || plan.tickets.open[0]?.id, 
        customFieldIds.lastPlanDate, plan.generatedAt.toISOString());
        
      console.log(`Stored execution plan metadata for plan ${plan.planId}`);
    } catch (error) {
      console.error('Error storing execution plan metadata:', error);
      throw new Error('Failed to store execution plan metadata');
    }
  }

  /**
   * Store execution plan summary as a comment on each ticket
   */
  async storeExecutionPlanComments(plan: ExecutionPlan): Promise<void> {
    await this.ensureConnected();
    
    try {
      const comment = this.formatExecutionPlanComment(plan);
      
      // Add comment to all tickets in the plan
      const allTickets = [...plan.tickets.finished, ...plan.tickets.inProgress, ...plan.tickets.open];
      
      for (const ticket of allTickets) {
        await this.addTicketComment(ticket.id, comment);
      }
      
      console.log(`Stored execution plan comments for plan ${plan.planId} on ${allTickets.length} tickets`);
    } catch (error) {
      console.error('Error storing execution plan comments:', error);
      throw new Error('Failed to store execution plan comments');
    }
  }

  /**
   * Retrieve execution plan metadata from Linear
   */
  async getExecutionPlanMetadata(ticketId: string, customFieldIds: { executionPlanId: string; lastPlanDate: string }): Promise<{ planId?: string; lastPlanDate?: string }> {
    await this.ensureConnected();
    
    try {
      const customFields = await this.getCustomFields(ticketId);
      
      const planIdField = customFields.find(field => field.customField.id === customFieldIds.executionPlanId);
      const lastPlanDateField = customFields.find(field => field.customField.id === customFieldIds.lastPlanDate);
      
      return {
        planId: planIdField?.value as string,
        lastPlanDate: lastPlanDateField?.value as string,
      };
    } catch (error) {
      console.error('Error retrieving execution plan metadata:', error);
      throw new Error('Failed to retrieve execution plan metadata');
    }
  }

  /**
   * Create or update custom field definitions for execution plan storage
   */
  async ensureCustomFieldDefinitions(teamId: string, customFieldIds: { executionPlanId: string; lastPlanDate: string }): Promise<void> {
    await this.ensureConnected();
    
    try {
      const existingFields = await this.getCustomFieldDefinitions(teamId);
      
      // Check if execution plan ID field exists
      const executionPlanIdField = existingFields.find(field => field.id === customFieldIds.executionPlanId);
      if (!executionPlanIdField) {
        await this.client.callTool({
          name: 'create_custom_field_definition',
          arguments: {
            teamId,
            name: 'Execution Plan ID',
            type: 'text',
            description: 'Stores the execution plan ID for this ticket',
          },
        });
      }
      
      // Check if last plan date field exists
      const lastPlanDateField = existingFields.find(field => field.id === customFieldIds.lastPlanDate);
      if (!lastPlanDateField) {
        await this.client.callTool({
          name: 'create_custom_field_definition',
          arguments: {
            teamId,
            name: 'Last Plan Date',
            type: 'date',
            description: 'Stores the last execution plan date for this ticket',
          },
        });
      }
      
      console.log('Ensured custom field definitions exist for execution plan storage');
    } catch (error) {
      console.error('Error ensuring custom field definitions:', error);
      throw new Error('Failed to ensure custom field definitions');
    }
  }

  private parseMCPResponse<T>(result: unknown): T | null {
    interface MCPResponse {
      content?: Array<{ type: string; text: string }>;
    }
    
    const mcpResult = result as MCPResponse;
    if (
      mcpResult && 
      mcpResult.content && 
      Array.isArray(mcpResult.content) && 
      mcpResult.content[0]?.type === 'text'
    ) {
      try {
        return JSON.parse(mcpResult.content[0].text);
      } catch (error) {
        console.error('Failed to parse MCP response:', error);
        return null;
      }
    }
    return null;
  }

  private generatePlanSummary(
    finished: LinearIssue[],
    inProgress: LinearIssue[],
    open: LinearIssue[]
  ): string {
    const total = finished.length + inProgress.length + open.length;
    const completionRate = total > 0 ? Math.round((finished.length / total) * 100) : 0;
    
    return `You have ${total} total tickets: ${finished.length} completed, ${inProgress.length} in progress, and ${open.length} open. Completion rate: ${completionRate}%.`;
  }

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

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
    }
  }
}

// Factory function to create a Linear MCP client
export function createLinearMCPClient(): LinearMCPClient {
  return new LinearMCPClientImpl();
}