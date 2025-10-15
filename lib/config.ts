import { ColorScheme, StartScreenPrompt, ThemeOption } from "@openai/chatkit";

export const WORKFLOW_ID =
  process.env.NEXT_PUBLIC_CHATKIT_WORKFLOW_ID?.trim() ?? "";

export const CREATE_SESSION_ENDPOINT = "/api/create-session";

export const STARTER_PROMPTS: StartScreenPrompt[] = [
  {
    label: "What can you do?",
    prompt: "What can you do?",
    icon: "circle-question",
  },
  {
    label: "Generate execution plan",
    prompt: "Generate an execution plan for my Linear tickets",
  },
  {
    label: "View team summary",
    prompt: "Show me a team summary of our Linear tickets",
  },
];

export const PLACEHOLDER_INPUT = "Ask anything...";

export const GREETING = "How can I help you today?";

// Linear Configuration
export const LINEAR_CONFIG = {
  apiKey: process.env.LINEAR_API_KEY || "",
  teamId: process.env.LINEAR_TEAM_ID || "",
  customFields: {
    executionPlanId: process.env.LINEAR_EXECUTION_PLAN_FIELD_ID || "",
    lastPlanDate: process.env.LINEAR_LAST_PLAN_DATE_FIELD_ID || "",
  },
};

// Slack Configuration
export const SLACK_CONFIG = {
  botToken: process.env.SLACK_BOT_TOKEN || "",
  appToken: process.env.SLACK_APP_TOKEN || "",
  signingSecret: process.env.SLACK_SIGNING_SECRET || "",
  channels: {
    summary: process.env.SLACK_SUMMARY_CHANNEL_ID || "",
    admin: process.env.SLACK_ADMIN_CHANNEL_ID || "",
  },
  userGroups: {
    summary: process.env.SLACK_SUMMARY_USER_GROUP_ID || "",
  },
};

// Agent Configuration
export const AGENT_CONFIG = {
  adminUserIds: process.env.ADMIN_USER_IDS?.split(",") || [],
  defaultCron: process.env.DEFAULT_CRON_SCHEDULE || "0 9 * * 1", // Every Monday at 9 AM
  timezone: process.env.DEFAULT_TIMEZONE || "America/New_York",
};

export const getThemeConfig = (theme: ColorScheme): ThemeOption => ({
  color: {
    grayscale: {
      hue: 220,
      tint: 6,
      shade: theme === "dark" ? -1 : -4,
    },
    accent: {
      primary: theme === "dark" ? "#f1f5f9" : "#0f172a",
      level: 1,
    },
  },
  radius: "round",
  // Add other theme options here
  // chatkit.studio/playground to explore config options
});
