export interface AgentConfig {
  linear: {
    apiKey: string;
    teamId: string;
    customFields: {
      executionPlanId: string;
      lastPlanDate: string;
    };
  };
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
    channels: {
      summary: string;
      admin: string;
    };
    userGroups: {
      summary: string;
    };
  };
  scheduling: {
    defaultCron: string;
    timezone: string;
    adminUserIds: string[];
  };
  planGeneration: {
    includeCompletedTickets: boolean;
    includeCanceledTickets: boolean;
    maxTicketsPerUser: number;
    maxPlansPerExecution: number;
  };
  features: {
    enableSlackNotifications: boolean;
    enableTeamSummaries: boolean;
    enableUserModifications: boolean;
    enableScheduledExecution: boolean;
  };
}

export interface EnvironmentConfig {
  LINEAR_API_KEY: string;
  LINEAR_TEAM_ID: string;
  SLACK_BOT_TOKEN: string;
  SLACK_APP_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  ADMIN_USER_IDS: string;
  SUMMARY_CHANNEL_ID: string;
  SUMMARY_USER_GROUP_ID: string;
  DEFAULT_CRON_SCHEDULE: string;
  DEFAULT_TIMEZONE: string;
  MAX_TICKETS_PER_USER: string;
  MAX_PLANS_PER_EXECUTION: string;
  ENABLE_SLACK_NOTIFICATIONS: string;
  ENABLE_TEAM_SUMMARIES: string;
  ENABLE_USER_MODIFICATIONS: string;
  ENABLE_SCHEDULED_EXECUTION: string;
}

export class ConfigManager {
  private config: AgentConfig;

  constructor(envConfig?: Partial<EnvironmentConfig>) {
    this.config = this.loadConfig(envConfig);
  }

  private loadConfig(envConfig?: Partial<EnvironmentConfig>): AgentConfig {
    const env = process.env as Partial<EnvironmentConfig>;
    const config = envConfig ? { ...env, ...envConfig } : env;

    return {
      linear: {
        apiKey: config.LINEAR_API_KEY || '',
        teamId: config.LINEAR_TEAM_ID || '',
        customFields: {
          executionPlanId: 'execution_plan_id',
          lastPlanDate: 'last_plan_date',
        },
      },
      slack: {
        botToken: config.SLACK_BOT_TOKEN || '',
        appToken: config.SLACK_APP_TOKEN || '',
        signingSecret: config.SLACK_SIGNING_SECRET || '',
        channels: {
          summary: config.SUMMARY_CHANNEL_ID || '',
          admin: config.ADMIN_CHANNEL_ID || '',
        },
        userGroups: {
          summary: config.SUMMARY_USER_GROUP_ID || '',
        },
      },
      scheduling: {
        defaultCron: config.DEFAULT_CRON_SCHEDULE || '0 9 * * 1', // Every Monday at 9 AM
        timezone: config.DEFAULT_TIMEZONE || 'America/New_York',
        adminUserIds: this.parseCommaSeparated(config.ADMIN_USER_IDS || ''),
      },
      planGeneration: {
        includeCompletedTickets: config.INCLUDE_COMPLETED_TICKETS === 'true',
        includeCanceledTickets: config.INCLUDE_CANCELED_TICKETS === 'true',
        maxTicketsPerUser: parseInt(config.MAX_TICKETS_PER_USER || '50', 10),
        maxPlansPerExecution: parseInt(config.MAX_PLANS_PER_EXECUTION || '100', 10),
      },
      features: {
        enableSlackNotifications: config.ENABLE_SLACK_NOTIFICATIONS !== 'false',
        enableTeamSummaries: config.ENABLE_TEAM_SUMMARIES !== 'false',
        enableUserModifications: config.ENABLE_USER_MODIFICATIONS !== 'false',
        enableScheduledExecution: config.ENABLE_SCHEDULED_EXECUTION !== 'false',
      },
    };
  }

  private parseCommaSeparated(value: string): string[] {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  validateConfig(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate Linear configuration
    if (!this.config.linear.apiKey) {
      errors.push('LINEAR_API_KEY is required');
    }

    if (!this.config.linear.teamId) {
      errors.push('LINEAR_TEAM_ID is required');
    }

    // Validate Slack configuration
    if (this.config.features.enableSlackNotifications) {
      if (!this.config.slack.botToken) {
        errors.push('SLACK_BOT_TOKEN is required when Slack notifications are enabled');
      }

      if (!this.config.slack.appToken) {
        errors.push('SLACK_APP_TOKEN is required when Slack notifications are enabled');
      }

      if (!this.config.slack.signingSecret) {
        errors.push('SLACK_SIGNING_SECRET is required when Slack notifications are enabled');
      }

      if (this.config.features.enableTeamSummaries && !this.config.slack.channels.summary) {
        warnings.push('SUMMARY_CHANNEL_ID is recommended when team summaries are enabled');
      }
    }

    // Validate scheduling configuration
    if (this.config.features.enableScheduledExecution) {
      if (this.config.scheduling.adminUserIds.length === 0) {
        warnings.push('ADMIN_USER_IDS is recommended when scheduled execution is enabled');
      }

      if (!this.isValidCronExpression(this.config.scheduling.defaultCron)) {
        errors.push('DEFAULT_CRON_SCHEDULE is not a valid cron expression');
      }
    }

    // Validate plan generation configuration
    if (this.config.planGeneration.maxTicketsPerUser <= 0) {
      errors.push('MAX_TICKETS_PER_USER must be greater than 0');
    }

    if (this.config.planGeneration.maxTicketsPerUser > 1000) {
      warnings.push('MAX_TICKETS_PER_USER is very high and may impact performance');
    }

    if (this.config.planGeneration.maxPlansPerExecution <= 0) {
      errors.push('MAX_PLANS_PER_EXECUTION must be greater than 0');
    }

    if (this.config.planGeneration.maxPlansPerExecution > 1000) {
      warnings.push('MAX_PLANS_PER_EXECUTION is very high and may impact performance');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private isValidCronExpression(cron: string): boolean {
    const parts = cron.split(' ');
    if (parts.length !== 5) return false;

    const [minute, hour, day, month, weekday] = parts;

    return (
      this.isValidCronField(minute, 0, 59) &&
      this.isValidCronField(hour, 0, 23) &&
      this.isValidCronField(day, 1, 31) &&
      this.isValidCronField(month, 1, 12) &&
      this.isValidCronField(weekday, 0, 6)
    );
  }

  private isValidCronField(field: string, min: number, max: number): boolean {
    if (field === '*') return true;
    
    const values = field.split(',');
    for (const value of values) {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < min || num > max) {
        return false;
      }
    }
    
    return true;
  }

  // Get configuration for specific components
  getLinearConfig() {
    return this.config.linear;
  }

  getSlackConfig() {
    return this.config.slack;
  }

  getSchedulingConfig() {
    return this.config.scheduling;
  }

  getPlanGenerationConfig() {
    return this.config.planGeneration;
  }

  getFeaturesConfig() {
    return this.config.features;
  }

  // Check if a feature is enabled
  isFeatureEnabled(feature: keyof AgentConfig['features']): boolean {
    return this.config.features[feature];
  }

  // Get environment-specific configuration
  getEnvironmentConfig(): EnvironmentConfig {
    return {
      LINEAR_API_KEY: this.config.linear.apiKey,
      LINEAR_TEAM_ID: this.config.linear.teamId,
      SLACK_BOT_TOKEN: this.config.slack.botToken,
      SLACK_APP_TOKEN: this.config.slack.appToken,
      SLACK_SIGNING_SECRET: this.config.slack.signingSecret,
      ADMIN_USER_IDS: this.config.scheduling.adminUserIds.join(','),
      SUMMARY_CHANNEL_ID: this.config.slack.channels.summary,
      SUMMARY_USER_GROUP_ID: this.config.slack.userGroups.summary,
      DEFAULT_CRON_SCHEDULE: this.config.scheduling.defaultCron,
      DEFAULT_TIMEZONE: this.config.scheduling.timezone,
      MAX_TICKETS_PER_USER: this.config.planGeneration.maxTicketsPerUser.toString(),
      MAX_PLANS_PER_EXECUTION: this.config.planGeneration.maxPlansPerExecution.toString(),
      ENABLE_SLACK_NOTIFICATIONS: this.config.features.enableSlackNotifications.toString(),
      ENABLE_TEAM_SUMMARIES: this.config.features.enableTeamSummaries.toString(),
      ENABLE_USER_MODIFICATIONS: this.config.features.enableUserModifications.toString(),
      ENABLE_SCHEDULED_EXECUTION: this.config.features.enableScheduledExecution.toString(),
    };
  }
}

// Factory function to create a config manager
export function createConfigManager(envConfig?: Partial<EnvironmentConfig>): ConfigManager {
  return new ConfigManager(envConfig);
}

// Default configuration for development
export const defaultConfig: AgentConfig = {
  linear: {
    apiKey: '',
    teamId: '',
    customFields: {
      executionPlanId: 'execution_plan_id',
      lastPlanDate: 'last_plan_date',
    },
  },
  slack: {
    botToken: '',
    appToken: '',
    signingSecret: '',
    channels: {
      summary: '',
      admin: '',
    },
    userGroups: {
      summary: '',
    },
  },
  scheduling: {
    defaultCron: '0 9 * * 1', // Every Monday at 9 AM
    timezone: 'America/New_York',
    adminUserIds: [],
  },
  planGeneration: {
    includeCompletedTickets: false,
    includeCanceledTickets: false,
    maxTicketsPerUser: 50,
    maxPlansPerExecution: 100,
  },
  features: {
    enableSlackNotifications: true,
    enableTeamSummaries: true,
    enableUserModifications: true,
    enableScheduledExecution: true,
  },
};