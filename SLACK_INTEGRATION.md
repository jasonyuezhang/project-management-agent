# Slack MCP Integration

This document describes the Slack MCP integration for the Project Management Agent, implementing Phase 1.2 of the implementation plan.

## Overview

The Slack MCP integration enables the Project Management Agent to:
- Send execution plan messages to individual users
- Send team summary messages to channels
- Listen for user replies and modifications
- Parse and validate user modifications
- Create interactive messages with buttons and actions

## Components

### 1. Slack MCP Client (`lib/mcp/slack-client.ts`)

The main client for interacting with Slack through the MCP protocol.

**Key Features:**
- Connection management to Slack MCP server
- Message sending (direct messages, channel messages, execution plans)
- User and channel management
- Reply listening and parsing
- Interactive message creation

**Usage:**
```typescript
import { createSlackMCPClient } from '@/lib/mcp/slack-client';

const slackClient = createSlackMCPClient();
await slackClient.connect();

// Send execution plan message
const messageId = await slackClient.sendExecutionPlanMessage(message);

// Listen for replies
const replies = await slackClient.listenForReplies(messageId);

await slackClient.disconnect();
```

### 2. Slack Types (`lib/mcp/slack-types.ts`)

Comprehensive TypeScript types for Slack integration.

**Key Types:**
- `SlackUser` - User information
- `SlackChannel` - Channel information
- `SlackMessage` - Message structure
- `SlackBlock` - Block kit elements
- `SlackAttachment` - Message attachments
- `PlanModification` - User modification parsing
- `ValidationResult` - Modification validation

### 3. Message Templates (`lib/templates/slack-templates.ts`)

Pre-built message templates for different scenarios.

**Templates:**
- `createExecutionPlanMessage()` - Individual execution plan
- `createTeamSummaryMessage()` - Team summary
- `createConfirmationMessage()` - Plan confirmation
- `createErrorMessage()` - Error messages
- `createHelpMessage()` - Help and instructions

**Usage:**
```typescript
import { createExecutionPlanMessage } from '@/lib/templates/slack-templates';

const message = createExecutionPlanMessage(plan, channelId, threadTs);
const messageId = await slackClient.sendExecutionPlanMessage(message);
```

### 4. Reply Processor (`lib/processors/reply-processor.ts`)

Parses and validates user replies to execution plan messages.

**Features:**
- Parse natural language commands
- Extract ticket IDs and actions
- Validate modifications
- Format modifications for display

**Supported Commands:**
- `Move [ticket-id] to [status]` - Change ticket status
- `Reassign [ticket-id] to [user]` - Reassign ticket
- `Add comment to [ticket-id]: [comment]` - Add comment
- `Confirm` - Confirm entire plan
- `Help` - Show help message

**Usage:**
```typescript
import { createReplyProcessor } from '@/lib/processors/reply-processor';

const processor = createReplyProcessor();
const modifications = await processor.parseUserReply(reply, userId);
const validation = await processor.validateModifications(modifications, tickets, users);
```

## Configuration

### Environment Variables

```bash
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your_signing_secret

# Channel Configuration
SLACK_SUMMARY_CHANNEL_ID=C1234567890
SLACK_ADMIN_CHANNEL_ID=C1234567890
SLACK_SUMMARY_USER_GROUP_ID=S1234567890
```

### Configuration Object

```typescript
// lib/config.ts
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
```

## API Endpoints

### Test Connection
```
GET /api/slack/test-connection
```
Tests the Slack MCP connection and returns user/channel information.

### Send Test Message
```
POST /api/slack/send-test-message
Content-Type: application/json

{
  "channelId": "C1234567890",
  "userId": "U1234567890"
}
```
Sends a test execution plan message to the specified channel.

## Testing

### Test Page
Visit `/test-slack` to access the interactive test page where you can:
- Test Slack MCP connection
- Send test execution plan messages
- View test results and configuration

### Unit Tests
Run the test suite to verify functionality:
```bash
npm test lib/mcp/__tests__/slack-client.test.ts
```

## Message Flow

### 1. Execution Plan Generation
1. Generate execution plans using Linear MCP client
2. Create Slack message using templates
3. Send to individual users or channels
4. Store message ID for reply tracking

### 2. User Interaction
1. User receives execution plan message
2. User replies with modifications
3. Reply processor parses modifications
4. Modifications are validated
5. Valid modifications are applied to Linear

### 3. Confirmation
1. User confirms plan or requests changes
2. Confirmation message is sent
3. Plan is applied to Linear tickets
4. Summary is sent to team channels

## Error Handling

The integration includes comprehensive error handling:
- Connection failures with retry logic
- Message sending failures with fallback
- Reply parsing errors with user feedback
- Validation errors with helpful messages
- Rate limiting and timeout handling

## Security Considerations

- All Slack webhook signatures are verified
- User permissions are validated before applying changes
- Rate limiting prevents API abuse
- Audit logging for all modifications
- Secure storage of API tokens

## Future Enhancements

- Real-time message updates
- Advanced interactive elements
- Custom command processing
- Integration with other Slack apps
- Mobile-optimized messages
- Voice command support

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check environment variables
   - Verify Slack app permissions
   - Ensure MCP server is running

2. **Messages Not Sending**
   - Verify channel IDs are correct
   - Check bot permissions in channels
   - Ensure message format is valid

3. **Replies Not Parsing**
   - Check command format
   - Verify ticket ID patterns
   - Review validation rules

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=slack-mcp:*
```

## Support

For issues or questions:
1. Check the test page at `/test-slack`
2. Review the unit tests
3. Check environment variable configuration
4. Verify Slack app setup and permissions