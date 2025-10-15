import { LinearMCPClient } from './mcp/linear-client.js';
import { ExecutionPlan, TeamSummary, LinearIssue, LinearUser, LinearTeam } from './mcp/types.js';

export interface PlanGeneratorConfig {
  teamId?: string;
  includeCompletedTickets: boolean;
  includeCanceledTickets: boolean;
  maxTicketsPerUser: number;
  customFields?: {
    executionPlanId: string;
    lastPlanDate: string;
  };
}

export class PlanGenerator {
  private linearClient: LinearMCPClient;
  private config: PlanGeneratorConfig;

  constructor(linearClient: LinearMCPClient, config: PlanGeneratorConfig = {
    includeCompletedTickets: false,
    includeCanceledTickets: false,
    maxTicketsPerUser: 50
  }) {
    this.linearClient = linearClient;
    this.config = config;
  }

  async generateIndividualPlans(teamId?: string): Promise<ExecutionPlan[]> {
    await this.linearClient.connect();
    
    try {
      const targetTeamId = teamId || this.config.teamId;
      const users = await this.getTeamUsers(targetTeamId);
      const plans: ExecutionPlan[] = [];

      for (const user of users) {
        const plan = await this.generateUserPlan(user, targetTeamId);
        if (plan) {
          plans.push(plan);
        }
      }

      return plans;
    } finally {
      await this.linearClient.disconnect();
    }
  }

  async generateTeamSummary(teamId: string): Promise<TeamSummary> {
    await this.linearClient.connect();
    
    try {
      const plans = await this.generateIndividualPlans(teamId);
      const team = await this.getTeamById(teamId);

      if (!team) {
        throw new Error(`Team with ID ${teamId} not found`);
      }

      const summary = this.calculateTeamSummary(team, plans);
      return summary;
    } finally {
      await this.linearClient.disconnect();
    }
  }

  async generateUserPlan(user: LinearUser, teamId?: string): Promise<ExecutionPlan | null> {
    try {
      const userTickets = await this.getUserTickets(user.id, teamId);
      
      if (userTickets.length === 0) {
        return null; // Skip users with no tickets
      }

      const categorizedTickets = this.categorizeTickets(userTickets);
      const summary = this.generatePlanSummary(categorizedTickets, user);

      const plan: ExecutionPlan = {
        userId: user.id,
        userName: user.displayName,
        tickets: categorizedTickets,
        summary,
        generatedAt: new Date(),
        planId: this.generatePlanId(user.id),
      };

      return plan;
    } catch (error) {
      console.error(`Error generating plan for user ${user.displayName}:`, error);
      return null;
    }
  }

  private async getTeamUsers(teamId?: string): Promise<LinearUser[]> {
    const allUsers = await this.linearClient.getUsers();
    
    if (!teamId) {
      return allUsers;
    }

    // Filter users by team if teamId is provided
    // Note: This is a simplified approach. In a real implementation,
    // you might need to check team membership through Linear's API
    return allUsers;
  }

  private async getTeamById(teamId: string): Promise<LinearTeam | null> {
    const teams = await this.linearClient.getTeams();
    return teams.find(team => team.id === teamId) || null;
  }

  private async getUserTickets(userId: string, teamId?: string): Promise<LinearIssue[]> {
    const tickets = await this.linearClient.getTicketsByAssignee(userId);
    
    // Apply filters based on configuration
    let filteredTickets = tickets;

    if (!this.config.includeCompletedTickets) {
      filteredTickets = filteredTickets.filter(ticket => 
        ticket.state.type !== 'completed'
      );
    }

    if (!this.config.includeCanceledTickets) {
      filteredTickets = filteredTickets.filter(ticket => 
        ticket.state.type !== 'canceled'
      );
    }

    // Apply team filter if specified
    if (teamId) {
      filteredTickets = filteredTickets.filter(ticket => 
        ticket.team.id === teamId
      );
    }

    // Limit number of tickets per user
    if (filteredTickets.length > this.config.maxTicketsPerUser) {
      filteredTickets = filteredTickets
        .sort((a, b) => this.getTicketPriority(b) - this.getTicketPriority(a))
        .slice(0, this.config.maxTicketsPerUser);
    }

    return filteredTickets;
  }

  private categorizeTickets(tickets: LinearIssue[]): {
    finished: LinearIssue[];
    inProgress: LinearIssue[];
    open: LinearIssue[];
  } {
    const finished = tickets.filter(ticket => 
      ticket.state.type === 'completed'
    );
    
    const inProgress = tickets.filter(ticket => 
      ticket.state.type === 'started'
    );
    
    const open = tickets.filter(ticket => 
      ['backlog', 'unstarted'].includes(ticket.state.type)
    );

    return { finished, inProgress, open };
  }

  private generatePlanSummary(
    categorizedTickets: { finished: LinearIssue[]; inProgress: LinearIssue[]; open: LinearIssue[] },
    user: LinearUser
  ): string {
    const { finished, inProgress, open } = categorizedTickets;
    const total = finished.length + inProgress.length + open.length;
    
    if (total === 0) {
      return `${user.displayName} has no tickets assigned.`;
    }

    const completionRate = total > 0 ? Math.round((finished.length / total) * 100) : 0;
    
    let summary = `${user.displayName} has ${total} total tickets: `;
    summary += `${finished.length} completed, ${inProgress.length} in progress, and ${open.length} open. `;
    summary += `Completion rate: ${completionRate}%.`;

    // Add insights based on ticket distribution
    if (inProgress.length > 5) {
      summary += ` Note: You have many tickets in progress - consider focusing on completing some before starting new ones.`;
    }

    if (open.length > 10) {
      summary += ` Note: You have many open tickets - consider prioritizing and organizing your backlog.`;
    }

    if (finished.length > 0 && inProgress.length === 0 && open.length > 0) {
      summary += ` Great job completing your in-progress work! Ready to tackle the next priority.`;
    }

    return summary;
  }

  private calculateTeamSummary(team: LinearTeam, plans: ExecutionPlan[]): TeamSummary {
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
      teamId: team.id,
      teamName: team.name,
      totalTickets,
      completedTickets,
      inProgressTickets,
      openTickets,
      completionRate,
      plans,
      generatedAt: new Date(),
    };
  }

  private getTicketPriority(ticket: LinearIssue): number {
    // Higher priority = higher number
    // Priority: 4 (Urgent) > 3 (High) > 2 (Medium) > 1 (Low) > 0 (No priority)
    return ticket.priority;
  }

  private generatePlanId(userId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `plan_${userId}_${timestamp}_${random}`;
  }

  // Method to update configuration
  updateConfig(newConfig: Partial<PlanGeneratorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // Method to get current configuration
  getConfig(): PlanGeneratorConfig {
    return { ...this.config };
  }

  // Method to validate configuration
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.config.maxTicketsPerUser <= 0) {
      errors.push('maxTicketsPerUser must be greater than 0');
    }

    if (this.config.maxTicketsPerUser > 1000) {
      errors.push('maxTicketsPerUser should not exceed 1000 for performance reasons');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Factory function to create a plan generator
export function createPlanGenerator(
  linearClient: LinearMCPClient,
  config?: PlanGeneratorConfig
): PlanGenerator {
  return new PlanGenerator(linearClient, config);
}