import { NextRequest, NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';
import { createPlanGenerator } from '@/lib/plan-generator';
import { createEnhancedPlanScheduler } from '@/lib/enhanced-scheduler';
import { createConfigManager } from '@/lib/config/agent-config';
import { createLogger, LogLevel } from '@/lib/monitoring/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const adminUserId = searchParams.get('adminUserId');
    const timeRange = searchParams.get('timeRange') || '24h';
    
    if (!adminUserId) {
      return NextResponse.json({
        success: false,
        error: 'Admin user ID is required',
      }, { status: 400 });
    }
    
    const configManager = createConfigManager();
    const config = configManager.getConfig();
    
    // Validate admin user
    if (!config.scheduling.adminUserIds.includes(adminUserId)) {
      return NextResponse.json({
        success: false,
        error: 'Unauthorized: User is not an admin',
      }, { status: 403 });
    }
    
    const linearClient = createLinearMCPClient();
    const slackClient = createSlackMCPClient();
    const planGenerator = createPlanGenerator(linearClient);
    const scheduler = createEnhancedPlanScheduler(linearClient, slackClient, planGenerator);
    const logger = createLogger();
    
    // Calculate time range
    const now = new Date();
    let startTime: Date;
    
    switch (timeRange) {
      case '1h':
        startTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // Get execution statistics
    const executionStats = scheduler.getExecutionStats();
    
    // Get schedule information
    const scheduleInfo = await scheduler.getScheduleInfo();
    
    // Get active sessions
    const activeSessions = await scheduler.getActiveSessions();
    
    // Get log statistics
    const logStats = await logger.getLogStats({ start: startTime, end: now });
    
    // Get recent logs
    const recentLogs = await logger.queryLogs({
      startDate: startTime,
      endDate: now,
      limit: 50
    });
    
    // Calculate health metrics
    const healthMetrics = {
      overallHealth: calculateOverallHealth(executionStats, logStats),
      systemUptime: calculateSystemUptime(),
      errorRate: logStats.errorRate,
      successRate: executionStats.successRate,
      activeSessions: activeSessions.length,
      pendingRetries: activeSessions.filter(s => s.status === 'failed' && (s.retryCount || 0) < 3).length
    };
    
    // Get performance metrics
    const performanceMetrics = {
      averageExecutionTime: executionStats.averageExecutionTime,
      totalExecutions: executionStats.totalSessions,
      completedExecutions: executionStats.completedSessions,
      failedExecutions: executionStats.failedSessions,
      retryRate: executionStats.retrySessions / Math.max(executionStats.totalSessions, 1) * 100
    };
    
    // Get configuration status
    const configStatus = {
      linear: {
        configured: !!config.linear.apiKey && !!config.linear.teamId,
        teamId: config.linear.teamId
      },
      slack: {
        configured: !!config.slack.botToken && !!config.slack.appToken,
        notificationsEnabled: config.features.enableSlackNotifications
      },
      scheduling: {
        enabled: config.features.enableScheduledExecution,
        timezone: config.scheduling.timezone,
        defaultCron: config.scheduling.defaultCron,
        adminUsers: config.scheduling.adminUserIds.length
      }
    };
    
    // Get recent activity
    const recentActivity = activeSessions.slice(0, 10).map(session => ({
      id: session.id,
      status: session.status,
      generatedAt: session.generatedAt,
      plansCount: session.plans.length,
      messageIdsCount: session.messageIds.length,
      errorMessage: session.errorMessage,
      retryCount: session.retryCount || 0
    }));
    
    // Get alerts
    const alerts = generateAlerts(executionStats, logStats, healthMetrics, configStatus);
    
    return NextResponse.json({
      success: true,
      data: {
        timestamp: now.toISOString(),
        timeRange,
        health: healthMetrics,
        performance: performanceMetrics,
        execution: executionStats,
        schedule: scheduleInfo,
        configuration: configStatus,
        logs: {
          stats: logStats,
          recent: recentLogs
        },
        activity: {
          recent: recentActivity,
          total: activeSessions.length
        },
        alerts
      }
    });
  } catch (error) {
    console.error('Failed to get monitoring dashboard:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

function calculateOverallHealth(
  executionStats: any,
  logStats: any
): 'healthy' | 'warning' | 'critical' {
  const errorRate = logStats.errorRate;
  const successRate = executionStats.successRate;
  const failedSessions = executionStats.failedSessions;
  
  if (errorRate > 10 || successRate < 70 || failedSessions > 5) {
    return 'critical';
  } else if (errorRate > 5 || successRate < 85 || failedSessions > 2) {
    return 'warning';
  } else {
    return 'healthy';
  }
}

function calculateSystemUptime(): number {
  // This is a simplified calculation
  // In production, you'd track actual system start time
  return 99.9; // Placeholder
}

function generateAlerts(
  executionStats: any,
  logStats: any,
  healthMetrics: any,
  configStatus: any
): Array<{
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
  component: string;
}> {
  const alerts: Array<{
    level: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: Date;
    component: string;
  }> = [];
  
  const now = new Date();
  
  // Configuration alerts
  if (!configStatus.linear.configured) {
    alerts.push({
      level: 'critical',
      message: 'Linear API is not properly configured',
      timestamp: now,
      component: 'configuration'
    });
  }
  
  if (!configStatus.slack.configured) {
    alerts.push({
      level: 'warning',
      message: 'Slack API is not properly configured',
      timestamp: now,
      component: 'configuration'
    });
  }
  
  // Performance alerts
  if (executionStats.successRate < 70) {
    alerts.push({
      level: 'critical',
      message: `Success rate is critically low: ${executionStats.successRate.toFixed(1)}%`,
      timestamp: now,
      component: 'performance'
    });
  } else if (executionStats.successRate < 85) {
    alerts.push({
      level: 'warning',
      message: `Success rate is below optimal: ${executionStats.successRate.toFixed(1)}%`,
      timestamp: now,
      component: 'performance'
    });
  }
  
  // Error rate alerts
  if (logStats.errorRate > 10) {
    alerts.push({
      level: 'critical',
      message: `Error rate is critically high: ${logStats.errorRate.toFixed(1)}%`,
      timestamp: now,
      component: 'logs'
    });
  } else if (logStats.errorRate > 5) {
    alerts.push({
      level: 'warning',
      message: `Error rate is elevated: ${logStats.errorRate.toFixed(1)}%`,
      timestamp: now,
      component: 'logs'
    });
  }
  
  // Failed sessions alerts
  if (executionStats.failedSessions > 5) {
    alerts.push({
      level: 'critical',
      message: `Too many failed sessions: ${executionStats.failedSessions}`,
      timestamp: now,
      component: 'execution'
    });
  } else if (executionStats.failedSessions > 2) {
    alerts.push({
      level: 'warning',
      message: `Multiple failed sessions: ${executionStats.failedSessions}`,
      timestamp: now,
      component: 'execution'
    });
  }
  
  // Retry alerts
  if (executionStats.retrySessions > 0) {
    alerts.push({
      level: 'info',
      message: `${executionStats.retrySessions} sessions are being retried`,
      timestamp: now,
      component: 'execution'
    });
  }
  
  return alerts;
}