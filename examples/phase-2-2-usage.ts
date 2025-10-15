/**
 * Phase 2.2 Implementation Usage Examples
 * 
 * This file demonstrates how to use the enhanced Scheduling System
 * with proper cron support, timezone handling, persistence, and monitoring.
 */

import { createLinearMCPClient } from '../lib/mcp/linear-client.js';
import { createSlackMCPClient } from '../lib/mcp/slack-client.js';
import { createPlanGenerator } from '../lib/plan-generator.js';
import { createEnhancedPlanScheduler } from '../lib/enhanced-scheduler.js';
import { createConfigManager } from '../lib/config/agent-config.js';
import { createLogger, LogLevel } from '../lib/monitoring/logger.js';

// Example 1: Enhanced Scheduling with Timezone Support
export async function setupAdvancedScheduling() {
  console.log('=== Advanced Scheduling Setup Example ===');
  
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
  
  const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
  
  try {
    // Schedule execution for every weekday at 9 AM EST
    const scheduleId = await scheduler.scheduleExecution({
      cronExpression: '0 9 * * 1-5', // Monday to Friday at 9 AM
      timezone: 'America/New_York',
      enabled: true,
      adminUserId: config.scheduling.adminUserIds[0],
      teamId: config.linear.teamId,
      summaryChannelId: config.slack.channels.summary,
      summaryUserGroupId: config.slack.userGroups.summary,
    });
    
    console.log(`Schedule created with ID: ${scheduleId}`);
    
    // Get schedule information
    const scheduleInfo = await scheduler.getScheduleInfo();
    console.log('Schedule Info:', {
      id: scheduleInfo?.id,
      isActive: scheduleInfo?.isActive,
      nextExecution: scheduleInfo?.nextExecution?.toISOString(),
      lastExecution: scheduleInfo?.lastExecution?.toISOString(),
    });
    
    return scheduleId;
  } catch (error) {
    console.error('Failed to setup advanced scheduling:', error);
    throw error;
  }
}

// Example 2: Session Management with Persistence
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
  
  const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
  
  try {
    // Trigger manual execution
    const session = await scheduler.triggerManualExecution(
      config.scheduling.adminUserIds[0],
      config.linear.teamId
    );
    
    console.log(`Session created: ${session.id}`);
    console.log(`Status: ${session.status}`);
    console.log(`Plans generated: ${session.plans.length}`);
    
    // Get all active sessions
    const activeSessions = await scheduler.getActiveSessions();
    console.log(`Total active sessions: ${activeSessions.length}`);
    
    // Get specific session
    const retrievedSession = await scheduler.getSession(session.id);
    console.log(`Retrieved session: ${retrievedSession?.id}`);
    
    // Update session status
    await scheduler.updateSessionStatus(session.id, 'completed');
    console.log('Session status updated to completed');
    
    return session;
  } catch (error) {
    console.error('Failed to demonstrate session management:', error);
    throw error;
  }
}

// Example 3: Error Handling and Retry Logic
export async function demonstrateErrorHandling() {
  console.log('=== Error Handling and Retry Example ===');
  
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
  
  const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
  
  try {
    // Simulate a failed execution by using invalid team ID
    const session = await scheduler.triggerManualExecution(
      config.scheduling.adminUserIds[0],
      'invalid-team-id'
    );
    
    console.log(`Session created: ${session.id}`);
    console.log(`Initial status: ${session.status}`);
    
    // If the session failed, retry it
    if (session.status === 'failed') {
      console.log('Session failed, attempting retry...');
      
      const retriedSession = await scheduler.retryFailedSession(session.id);
      if (retriedSession) {
        console.log(`Retry scheduled for session: ${retriedSession.id}`);
        console.log(`Retry count: ${retriedSession.retryCount}`);
        console.log(`Next retry at: ${retriedSession.nextRetryAt?.toISOString()}`);
      } else {
        console.log('Session could not be retried (exceeded max retries)');
      }
    }
    
    return session;
  } catch (error) {
    console.error('Failed to demonstrate error handling:', error);
    throw error;
  }
}

// Example 4: Monitoring and Logging
export async function demonstrateMonitoring() {
  console.log('=== Monitoring and Logging Example ===');
  
  const logger = createLogger();
  
  try {
    // Log various levels
    await logger.debug('Debug message', { component: 'example' });
    await logger.info('Info message', { component: 'example' });
    await logger.warn('Warning message', { component: 'example' });
    await logger.error('Error message', { component: 'example' });
    
    // Query logs
    const recentLogs = await logger.queryLogs({
      component: 'example',
      limit: 10
    });
    
    console.log(`Found ${recentLogs.length} recent logs`);
    
    // Get log statistics
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const logStats = await logger.getLogStats({
      start: yesterday,
      end: now
    });
    
    console.log('Log Statistics:', {
      totalLogs: logStats.totalLogs,
      errorRate: logStats.errorRate.toFixed(2) + '%',
      byLevel: logStats.byLevel,
      topErrors: logStats.topErrors.slice(0, 3)
    });
    
    // Get execution statistics
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
    
    const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
    const executionStats = scheduler.getExecutionStats();
    
    console.log('Execution Statistics:', {
      totalSessions: executionStats.totalSessions,
      successRate: executionStats.successRate.toFixed(2) + '%',
      averageExecutionTime: executionStats.averageExecutionTime.toFixed(2) + 'ms',
      retrySessions: executionStats.retrySessions
    });
    
  } catch (error) {
    console.error('Failed to demonstrate monitoring:', error);
    throw error;
  }
}

// Example 5: API Usage Examples
export async function demonstrateAPIUsage() {
  console.log('=== API Usage Examples ===');
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const adminUserId = 'admin-user-id'; // Replace with actual admin user ID
  
  try {
    // Schedule execution
    const scheduleResponse = await fetch(`${baseUrl}/api/admin/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cronExpression: '0 9 * * 1-5', // Weekdays at 9 AM
        timezone: 'America/New_York',
        enabled: true,
        adminUserId,
        teamId: 'team-id',
        summaryChannelId: 'channel-id',
        summaryUserGroupId: 'usergroup-id'
      })
    });
    
    const scheduleData = await scheduleResponse.json();
    console.log('Schedule Response:', scheduleData);
    
    // Get schedule info
    const scheduleInfoResponse = await fetch(`${baseUrl}/api/admin/schedule?adminUserId=${adminUserId}`);
    const scheduleInfoData = await scheduleInfoResponse.json();
    console.log('Schedule Info:', scheduleInfoData);
    
    // Trigger manual execution
    const triggerResponse = await fetch(`${baseUrl}/api/admin/trigger-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        adminUserId,
        teamId: 'team-id',
        forceRegenerate: false
      })
    });
    
    const triggerData = await triggerResponse.json();
    console.log('Trigger Response:', triggerData);
    
    // Get execution status
    const statusResponse = await fetch(`${baseUrl}/api/status/execution-plans?adminUserId=${adminUserId}`);
    const statusData = await statusResponse.json();
    console.log('Status Response:', statusData);
    
    // Get monitoring dashboard
    const dashboardResponse = await fetch(`${baseUrl}/api/monitoring/dashboard?adminUserId=${adminUserId}&timeRange=24h`);
    const dashboardData = await dashboardResponse.json();
    console.log('Dashboard Response:', {
      health: dashboardData.data?.health,
      performance: dashboardData.data?.performance,
      alerts: dashboardData.data?.alerts?.length || 0
    });
    
  } catch (error) {
    console.error('Failed to demonstrate API usage:', error);
    throw error;
  }
}

// Example 6: Cleanup and Maintenance
export async function demonstrateCleanup() {
  console.log('=== Cleanup and Maintenance Example ===');
  
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
  
  const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
  const logger = createLogger();
  
  try {
    // Get stats before cleanup
    const statsBefore = scheduler.getExecutionStats();
    console.log('Stats before cleanup:', statsBefore);
    
    // Cleanup old sessions and logs
    await scheduler.cleanupOldData(24); // Clean up data older than 24 hours
    console.log('Cleaned up old sessions and logs');
    
    // Cleanup old log entries
    const cleanedLogs = await logger.cleanupOldLogs(30); // Clean up logs older than 30 days
    console.log(`Cleaned up ${cleanedLogs} old log entries`);
    
    // Get stats after cleanup
    const statsAfter = scheduler.getExecutionStats();
    console.log('Stats after cleanup:', statsAfter);
    
    console.log(`Cleaned up ${statsBefore.totalSessions - statsAfter.totalSessions} old sessions`);
    
  } catch (error) {
    console.error('Failed to demonstrate cleanup:', error);
    throw error;
  }
}

// Example 7: Graceful Shutdown
export async function demonstrateGracefulShutdown() {
  console.log('=== Graceful Shutdown Example ===');
  
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
  
  const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
  const logger = createLogger();
  
  try {
    // Setup a schedule
    await scheduler.scheduleExecution({
      cronExpression: '0 9 * * 1-5',
      timezone: 'America/New_York',
      enabled: true,
      adminUserId: config.scheduling.adminUserIds[0],
      teamId: config.linear.teamId,
    });
    
    console.log('Schedule setup complete');
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Graceful shutdown
    console.log('Initiating graceful shutdown...');
    await scheduler.shutdown();
    await logger.shutdown();
    
    console.log('Graceful shutdown completed');
    
  } catch (error) {
    console.error('Failed to demonstrate graceful shutdown:', error);
    throw error;
  }
}

// Main execution function
export async function runAllPhase22Examples() {
  console.log('🚀 Running Phase 2.2 Implementation Examples\n');
  
  try {
    // Example 1: Advanced Scheduling
    await setupAdvancedScheduling();
    
    // Example 2: Session Management
    await demonstrateSessionManagement();
    
    // Example 3: Error Handling
    await demonstrateErrorHandling();
    
    // Example 4: Monitoring
    await demonstrateMonitoring();
    
    // Example 5: API Usage
    await demonstrateAPIUsage();
    
    // Example 6: Cleanup
    await demonstrateCleanup();
    
    // Example 7: Graceful Shutdown
    await demonstrateGracefulShutdown();
    
    console.log('\n✅ All Phase 2.2 examples completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Phase 2.2 examples failed:', error);
    throw error;
  }
}

// Export individual examples for testing
export {
  setupAdvancedScheduling,
  demonstrateSessionManagement,
  demonstrateErrorHandling,
  demonstrateMonitoring,
  demonstrateAPIUsage,
  demonstrateCleanup,
  demonstrateGracefulShutdown,
};