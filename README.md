# ChatKit Starter Template

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![NextJS](https://img.shields.io/badge/Built_with-NextJS-blue)
![OpenAI API](https://img.shields.io/badge/Powered_by-OpenAI_API-orange)

This repository is the simplest way to bootstrap a [ChatKit](http://openai.github.io/chatkit-js/) application. It ships with a minimal Next.js UI, the ChatKit web component, and a ready-to-use session endpoint so you can experiment with OpenAI-hosted workflows built using [Agent Builder](https://platform.openai.com/agent-builder).

## What You Get

- Next.js app with `<openai-chatkit>` web component and theming controls
- API endpoint for creating a session at [`app/api/create-session/route.ts`](app/api/create-session/route.ts)
- Config file for starter prompts, theme, placeholder text, and greeting message
- Integration with Linear and Slack APIs for project management
- Comprehensive testing setup with Jest
- SQLite database for session management

## Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key
- Linear API key (for Linear integration)
- Slack app credentials (for Slack integration)

## Getting Started

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd <repository-name>
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your credentials:

```bash
cp .env.example .env.local
```

### 3. Required Environment Variables

Update `.env.local` with the following variables:

#### Core ChatKit Configuration
- `OPENAI_API_KEY` — Your OpenAI API key (must be from the same org as your Agent Builder)
- `NEXT_PUBLIC_CHATKIT_WORKFLOW_ID` — Your workflow ID from Agent Builder (starts with `wf_...`)
- `CHATKIT_API_BASE` — (optional) Custom base URL for ChatKit API

#### Linear Integration
- `LINEAR_API_KEY` — Your Linear API key
- `LINEAR_TEAM_ID` — Your Linear team ID
- `LINEAR_EXECUTION_PLAN_FIELD_ID` — Custom field ID for execution plans
- `LINEAR_LAST_PLAN_DATE_FIELD_ID` — Custom field ID for last plan date

#### Slack Integration
- `SLACK_BOT_TOKEN` — Your Slack bot token
- `SLACK_APP_TOKEN` — Your Slack app token
- `SLACK_SIGNING_SECRET` — Your Slack app signing secret
- `SLACK_SUMMARY_CHANNEL_ID` — Channel ID for summary notifications
- `SLACK_ADMIN_CHANNEL_ID` — Channel ID for admin notifications
- `SLACK_SUMMARY_USER_GROUP_ID` — User group ID for summary notifications

#### Agent Configuration
- `ADMIN_USER_IDS` — Comma-separated list of admin user IDs
- `DEFAULT_CRON_SCHEDULE` — Default cron schedule (default: "0 9 * * 1")
- `DEFAULT_TIMEZONE` — Default timezone (default: "America/New_York")

### 4. Get Your Credentials

#### OpenAI API Key
Get your API key from the [OpenAI API Keys](https://platform.openai.com/api-keys) page.

#### ChatKit Workflow ID
Get your workflow ID from the [Agent Builder](https://platform.openai.com/agent-builder) interface after clicking "Publish":

<img src="./public/docs/workflow.jpg" width=500 />

#### Linear API Key
1. Go to Linear Settings > API
2. Create a new personal API key
3. Get your team ID from the URL when viewing your team

#### Slack App Setup
1. Create a new Slack app at [api.slack.com](https://api.slack.com/apps)
2. Enable Socket Mode and get your app token
3. Create a bot user and get the bot token
4. Set up event subscriptions and get the signing secret
5. Get channel and user group IDs from Slack

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:3000` and start chatting. Use the prompts on the start screen to verify your workflow connection.

### 6. Build for Production

```bash
npm run build
npm start
```

Before deploying, add your domain to the [Domain allowlist](https://platform.openai.com/settings/organization/security/domain-allowlist) on your OpenAI dashboard.

## Testing

This project includes a comprehensive testing setup using Jest and Testing Library.

### Test Configuration

The project uses:
- **Jest** for test runner and assertions
- **ts-jest** for TypeScript support
- **@testing-library/jest-dom** for DOM testing utilities
- **Node.js** test environment

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test suite
npm run test:phase-2-2
```

### Test Structure

Tests are organized in the following locations:
- `lib/__tests__/` - Core library tests
- `lib/mcp/__tests__/` - MCP client tests
- `*.test.ts` - Individual component tests

### Test Environment Setup

The test environment is configured in:
- `jest.config.js` - Main Jest configuration
- `jest.setup.js` - Test setup and global configurations
- `tsconfig.json` - TypeScript configuration for tests

### Writing Tests

Create test files following these patterns:
- `*.test.ts` for unit tests
- `*.spec.ts` for integration tests
- Place tests in `__tests__` directories or alongside source files

Example test structure:
```typescript
import { someFunction } from '../path/to/module';

describe('Module Tests', () => {
  test('should do something', () => {
    expect(someFunction()).toBe(expectedValue);
  });
});
```

### Test Coverage

The project tracks test coverage for:
- All files in `lib/` directory
- Excludes type definition files and test files themselves
- Coverage reports are generated in the `coverage/` directory

### Example Usage

Run the example scripts to see the system in action:

```bash
# Run phase 2.2 example
npm run example:phase-2-2
```

## Customization Tips

- Adjust starter prompts, greeting text, [chatkit theme](https://chatkit.studio/playground), and placeholder copy in [`lib/config.ts`](lib/config.ts).
- Update the event handlers inside [`components/ChatKitPanel.tsx`](components/ChatKitPanel.tsx) to integrate with your product analytics or storage.
- Modify test configurations in `jest.config.js` and `jest.setup.js` as needed.

## Dependencies

### Core Dependencies
- **Next.js 15.5.4** - React framework
- **React 19.2.0** - UI library
- **@openai/chatkit-react** - ChatKit React component
- **@modelcontextprotocol/sdk** - MCP protocol support
- **sqlite3** - Database for session management

### Development Dependencies
- **TypeScript 5** - Type safety
- **Jest 29.7.0** - Testing framework
- **ESLint** - Code linting
- **Tailwind CSS 4** - Styling

### Integration Dependencies
- **node-cron** - Scheduled task management
- **moment-timezone** - Timezone handling

## References

- [ChatKit JavaScript Library](http://openai.github.io/chatkit-js/)
- [Advanced Self-Hosting Examples](https://github.com/openai/openai-chatkit-advanced-samples)
- [Jest Testing Framework](https://jestjs.io/)
- [Next.js Documentation](https://nextjs.org/docs)
