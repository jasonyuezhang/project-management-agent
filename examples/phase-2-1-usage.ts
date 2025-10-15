/**
 * Phase 2.1 Implementation Usage Examples
 * 
 * This file demonstrates how to use the new Plan Generation Engine
 * and Scheduling System implemented in Phase 2.1.
 */

import { createLinearMCPClient } from '../lib/mcp/linear-client.js';
import { createSlackMCPClient } from '../lib/mcp/slack-client.js';
import { createPlanGenerator } from '../lib/plan-generator.js';
import { createPlanScheduler } from '../lib/scheduler.js';
import { createConfigManager } from '../lib/config/agent-config.js';

// Example 1: Basic Plan Generation
export async function generateBasicPlans() {
  console.log('=== Basic Plan Generation Example ===');
  
  const configManager = createConfigManager();
  const config = configManager.getConfig();
  
  const linearClient = createLinearMCPClient();
  const planGenerator = createPlanGenerator(linearClient, {
    teamId: config.linear.teamId,
    includeCompletedTickets: false,
    includeCanceledTickets: false,
    maxTicketsPerUser: 50,
  });
  
  try {
    // Generate plans for all users
    const plans = await planGenerator.generateIndividualPlans();
    console.log(`Generated ${plans.length} execution plans`);
    
    plans.forEach(plan => {
      console.log(`\nPlan for ${plan.userName}:`);
      console.log(`- Completed: ${plan.tickets.finished.length}`);
      console.log(`- In Progress: ${plan.tickets.inProgress.length}`);
      console.log(`- Open: ${plan.tickets.open.length}`);
      console.log(`- Summary: ${plan.summary}`);
    });
    
    return plans;
  } catch (error) {
    console.error('Failed to generate plans:', error);
    throw error;
  }
}

// Example 2: Team Summary Generation
export async function generateTeamSummary(teamId: string) {
  console.log('=== Team Summary Generation Example ===');
  
  const configManager = createConfigManager();
  const config = configManager.getConfig();
  
  const linearClient = createLinearMCPClient();
  const planGenerator = createPlanGenerator(linearClient, {
    teamId,
    includeCompletedTickets: true,
    includeCanceledTickets: false,
    maxTicketsPerUser: 100,
  });
  
  try {
    const summary = await planGenerator.generateTeamSummary(teamId);
    
    console.log(`\nTeam Summary for ${summary.teamName}:`);
    console.log(`- Total Tickets: ${summary.totalTickets}`);
    console.log(`- Completed: ${summary.completedTickets}`);
    console.log(`- In Progress: ${summary.inProgressTickets}`);
    console.log(`- Open: ${summary.openTickets}`);
    console.log(`- Completion Rate: ${summary.completionRate.toFixed(1)}%`);
    console.log(`- Individual Plans: ${summary.plans.length}`);
    
    return summary;
  } catch (error) {
    console.error('Failed to generate team summary:', error);
    throw error;
  }
}

// Example 3: Manual Plan Execution with Slack Integration
export async function executeManualPlan(adminUserId: string, teamId?: string) {
  console.log('=== Manual Plan Execution Example ===');
  
  const configManager = createConfigManager();
  const config = configManager.getConfig();
  
  const linearClient = createLinearMCPClient();
  const slackClient = createSlackMCPClient();
  const planGenerator = createPlanGenerator(linearClient, {
    teamId: teamId || config.linear.teamId,
    includeCompletedTickets: config.planGeneration.includeCompletedTickets,
    includeCanceledTickets: config.planGeneration.includeCanceledTickets,
    maxTicketsPerUser: config.planGeneration.maxTicketsPerUser,
  });
  
  const scheduler = createPlanScheduler(linearClient, slackClient, planGenerator);
  
  try {
    const session = await scheduler.triggerManualExecution(adminUserId, teamId);
    
    console.log(`\nExecution Session Created:`);
    console.log(`- Session ID: ${session.id}`);
    console.log(`- Status: ${session.status}`);
    console.log(`- Plans Generated: ${session.plans.length}`);
    console.log(`- Messages Sent: ${session.messageIds.length}`);
    console.log(`- Generated At: ${session.generatedAt.toISOString()}`);
    
    return session;
  } catch (error) {
    console.error('Failed to execute manual plan:', error);
    throw error;
  }
}

// Example 4: Scheduled Execution Setup
export async function setupScheduledExecution(adminUserId: string, teamId?: string) {
  console.log('=== Scheduled Execution Setup Example ===');
  
  const configManager = createConfigManager();
  const config = configManager.getConfig();
  
  const linearClient = createLinearMCPClient();
  const slackClient = createSlackMCPClient();
  const planGenerator = createPlanGenerator(linearClient, {
    teamId: teamId || config.linear.teamId,
    includeCompletedTickets: config.planGeneration.includeCompletedTickets,
    includeCanceledTickets: config.planGeneration.includeCanceledTickets,
    maxTicketsPerUser: config.planGeneration.maxTicketsPerUser,
  });
  
  const scheduler = createPlanScheduler(linearClient, slackClient, planGenerator);
  
  try {
    // Schedule execution for every Monday at 9 AM
    await scheduler.scheduleExecution({
      cronExpression: '0 9 * * 1', // Every Monday at 9 AM
      timezone: 'America/New_York',
      enabled: true,
      adminUserId,
      teamId: teamId || config.linear.teamId,
      summaryChannelId: config.slack.channels.summary,
      summaryUserGroupId: config.slack.userGroups.summary,
    });
    
    console.log('Scheduled execution set up successfully');
    console.log('- Schedule: Every Monday at 9 AM EST');
    console.log('- Admin User:', adminUserId);
    console.log('- Team ID:', teamId || config.linear.teamId);
    
  } catch (error) {
    console.error('Failed to setup scheduled execution:', error);
    throw error;
  }
}

// Example 5: Configuration Management
export function demonstrateConfigurationManagement() {
  console.log('=== Configuration Management Example ===');
  
  const configManager = createConfigManager();
  
  // Get current configuration
  const config = configManager.getConfig();
  console.log('Current configuration:', JSON.stringify(config, null, 2));
  
  // Validate configuration
  const validation = configManager.validateConfig();
  console.log('\nConfiguration validation:');
  console.log('- Valid:', validation.isValid);
  if (validation.errors.length > 0) {
    console.log('- Errors:', validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.log('- Warnings:', validation.warnings);
  }
  
  // Update configuration
  configManager.updateConfig({
    planGeneration: {
      includeCompletedTickets: true,
      includeCanceledTickets: false,
      maxTicketsPerUser: 75,
      maxPlansPerExecution: 50,
    },
    features: {
      enableSlackNotifications: true,
      enableTeamSummaries: true,
      enableUserModifications: true,
      enableScheduledExecution: false,
    },
  });
  
  console.log('\nUpdated configuration:', JSON.stringify(configManager.getConfig(), null, 2));
}

// Example 6: Session Management and Monitoring
export async function demonstrateSessionManagement() {
  console.log('=== Session Management Example ===');
  
  const configManager = createConfigManager();
  const config = configManager.getConfig();
  
  const linearClient = createLinearMCPClient();
  const slackClient = createSlackMCPClient();
  const planGenerator = createPlanGenerator(linearClient, {
    teamId: config.linear.teamId,
    includeCompletedTickets: config.planGeneration.includeCompletedTickets,
    includeCanceledTickets: config.planGeneration.includeCanceledTickets,
    maxTicketsPerUser: config.planGeneration.maxTicketsPerUser,
  });
  
  const scheduler = createPlanScheduler(linearClient, slackClient, planGenerator);
  
  try {
    // Get active sessions
    const activeSessions = await scheduler.getActiveSessions();
    console.log(`Active sessions: ${activeSessions.length}`);
    
    // Get execution statistics
    const stats = scheduler.getExecutionStats();
    console.log('\nExecution statistics:');
    console.log(`- Total Sessions: ${stats.totalSessions}`);
    console.log(`- Pending: ${stats.pendingSessions}`);
    console.log(`- Confirmed: ${stats.confirmedSessions}`);
    console.log(`- Completed: ${stats.completedSessions}`);
    console.log(`- Failed: ${stats.failedSessions}`);
    
    // Clean up old sessions (older than 24 hours)
    scheduler.cleanupOldSessions(24);
    console.log('\nCleaned up old sessions');
    
  } catch (error) {
    console.error('Failed to demonstrate session management:', error);
    throw error;
  }
}

// Example 7: Error Handling and Recovery
export async function demonstrateErrorHandling() {
  console.log('=== Error Handling Example ===');
  
  const configManager = createConfigManager();
  const config = configManager.getConfig();
  
  const linearClient = createLinearMCPClient();
  const planGenerator = createPlanGenerator(linearClient, {
    teamId: config.linear.teamId,
    includeCompletedTickets: config.planGeneration.includeCompletedTickets,
    includeCanceledTickets: config.planGeneration.includeCanceledTickets,
    maxTicketsPerUser: config.planGeneration.maxTicketsPerUser,
  });
  
  try {
    // This might fail if Linear API is not available
    const plans = await planGenerator.generateIndividualPlans();
    console.log('Plans generated successfully:', plans.length);
    
  } catch (error) {
    console.error('Plan generation failed:', error);
    
    // Implement retry logic
    console.log('Retrying in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const plans = await planGenerator.generateIndividualPlans();
      console.log('Retry successful:', plans.length);
    } catch (retryError) {
      console.error('Retry also failed:', retryError);
      throw retryError;
    }
  }
}

// Main execution function
export async function runAllExamples() {
  console.log('🚀 Running Phase 2.1 Implementation Examples\n');
  
  try {
    // Example 1: Basic Plan Generation
    await generateBasicPlans();
    
    // Example 2: Team Summary Generation
    const configManager = createConfigManager();
    const config = configManager.getConfig();
    if (config.linear.teamId) {
      await generateTeamSummary(config.linear.teamId);
    }
    
    // Example 3: Manual Plan Execution
    if (config.scheduling.adminUserIds.length > 0) {
      await executeManualPlan(config.scheduling.adminUserIds[0], config.linear.teamId);
    }
    
    // Example 4: Scheduled Execution Setup
    if (config.scheduling.adminUserIds.length > 0) {
      await setupScheduledExecution(config.scheduling.adminUserIds[0], config.linear.teamId);
    }
    
    // Example 5: Configuration Management
    demonstrateConfigurationManagement();
    
    // Example 6: Session Management
    await demonstrateSessionManagement();
    
    // Example 7: Error Handling
    await demonstrateErrorHandling();
    
    console.log('\n✅ All examples completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Examples failed:', error);
    throw error;
  }
}

// Export individual examples for testing
export {
  generateBasicPlans,
  generateTeamSummary,
  executeManualPlan,
  setupScheduledExecution,
  demonstrateConfigurationManagement,
  demonstrateSessionManagement,
  demonstrateErrorHandling,
};