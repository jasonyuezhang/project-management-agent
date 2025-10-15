# Phase 5.2: Local Storage for Session Management

This phase implements SQLite-based session management for execution plans, providing persistent storage for session data and plan modifications.

## Overview

Phase 5.2 adds local storage capabilities to track execution sessions and user modifications to plans. This complements the Linear-based storage from Phase 5.1 by providing session-level tracking and modification history.

## Architecture

### Core Components

1. **SessionDatabase** - Low-level SQLite database operations
2. **SessionManagementService** - High-level session management interface
3. **ExecutionSessionIntegration** - Integration with existing services
4. **REST API** - HTTP endpoints for session management

### Database Schema

```sql
-- Execution sessions table
CREATE TABLE execution_sessions (
  id TEXT PRIMARY KEY,
  generated_at DATETIME NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  admin_user_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  plan_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Plan modifications table
CREATE TABLE plan_modifications (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('status_change', 'reassign', 'comment')),
  value TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES execution_sessions(id) ON DELETE CASCADE
);
```

## Key Features

### Session Management
- **Create Sessions**: Track execution plan generation sessions
- **Status Tracking**: Monitor session lifecycle (pending → confirmed → completed)
- **Admin Management**: Track sessions by admin user
- **Team Organization**: Group sessions by team

### Plan Modifications
- **User Modifications**: Track user changes to execution plans
- **Action Types**: Support status changes, reassignments, and comments
- **Processing Status**: Track which modifications have been applied
- **Error Handling**: Store and track modification errors

### Data Persistence
- **SQLite Storage**: Lightweight, file-based database
- **Automatic Cleanup**: Remove old sessions and modifications
- **Indexing**: Optimized queries for performance
- **Transaction Safety**: ACID compliance for data integrity

## API Endpoints

### GET /api/sessions
Query parameters:
- `action=status&sessionId=<id>` - Get session status
- `action=active` - Get active sessions
- `action=stats` - Get session statistics

### POST /api/sessions
Request body:
```json
{
  "action": "create|modify|confirm|complete|cancel|cleanup",
  "sessionId": "string",
  "adminUserId": "string",
  "teamId": "string",
  "userId": "string",
  "ticketId": "string",
  "actionType": "status_change|reassign|comment",
  "value": "string",
  "reason": "string",
  "daysOld": "number"
}
```

## Usage Examples

### Basic Session Management

```typescript
import { createSessionManagementService } from './lib/services/session-management-service.js';

const sessionService = createSessionManagementService({
  databasePath: './data/sessions.db',
  autoCleanupDays: 30
});

// Create session
const session = await sessionService.createExecutionSession({
  adminUserId: 'admin-123',
  teamId: 'team-456',
  planCount: 5
});

// Add modifications
await sessionService.addPlanModification({
  sessionId: session.id,
  ticketId: 'ticket-1',
  userId: 'user-1',
  action: 'status_change',
  value: 'in_progress'
});

// Confirm and complete
await sessionService.confirmSession(session.id);
await sessionService.completeSession(session.id);
```

### Integration Service

```typescript
import { createExecutionSessionIntegration } from './lib/services/execution-session-integration.js';

const integration = createExecutionSessionIntegration({
  sessionManagement: { databasePath: './data/sessions.db' },
  linear: { apiKey: 'key', teamId: 'team' },
  slack: { botToken: 'token', appToken: 'app', signingSecret: 'secret' }
});

// Create session with full integration
const result = await integration.createExecutionSession('admin-123', 'team-456');

// Process user modification
await integration.processUserModification(
  result.sessionId,
  'user-1',
  'ticket-1',
  'status_change',
  'in_progress'
);
```

## Configuration

### Environment Variables

```bash
# Session Database
SESSION_DB_PATH=./data/sessions.db
SESSION_CLEANUP_DAYS=30

# Linear Integration
LINEAR_API_KEY=your_linear_api_key
LINEAR_TEAM_ID=your_team_id

# Slack Integration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your_signing_secret
```

### Service Configuration

```typescript
interface SessionManagementConfig {
  databasePath?: string;        // SQLite database file path
  autoCleanupDays?: number;     // Days to keep old sessions
}
```

## Data Models

### ExecutionSession

```typescript
interface ExecutionSession {
  id: string;
  generatedAt: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  adminUserId: string;
  teamId: string;
  planCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
```

### PlanModification

```typescript
interface PlanModification {
  id: string;
  sessionId: string;
  ticketId: string;
  userId: string;
  action: 'status_change' | 'reassign' | 'comment';
  value: string;
  timestamp: Date;
  processed?: boolean;
  error?: string;
}
```

## Testing

Run the phase 5.2 tests:

```bash
npm test -- --testPathPattern=phase-5-2
```

The test suite covers:
- Database operations
- Session management
- Modification tracking
- Error handling
- API endpoints
- Integration scenarios

## Performance Considerations

### Database Optimization
- Indexed columns for fast queries
- Automatic cleanup of old data
- Connection pooling for concurrent access
- Transaction batching for bulk operations

### Memory Management
- Lazy loading of session data
- Pagination for large result sets
- Automatic connection cleanup
- Efficient data serialization

## Security

### Data Protection
- SQL injection prevention through parameterized queries
- Input validation and sanitization
- Secure file permissions for database
- Environment variable protection

### Access Control
- Admin user validation
- Team-based access control
- Session ownership verification
- Audit trail for modifications

## Monitoring

### Metrics Available
- Total sessions created
- Session completion rates
- Modification processing times
- Error rates and types
- Database performance metrics

### Health Checks
- Database connectivity
- Session processing status
- Modification queue health
- Cleanup job status

## Troubleshooting

### Common Issues

1. **Database Lock Errors**
   - Ensure single instance access
   - Check file permissions
   - Verify no other processes using database

2. **Session Not Found**
   - Verify session ID format
   - Check session status
   - Confirm session exists in database

3. **Modification Processing Failures**
   - Check Linear API connectivity
   - Verify ticket permissions
   - Review error logs for details

### Debug Mode

Enable debug logging:

```typescript
const sessionService = createSessionManagementService({
  databasePath: './data/sessions.db',
  debug: true
});
```

## Future Enhancements

1. **Real-time Updates**: WebSocket support for live session updates
2. **Advanced Analytics**: Detailed reporting and insights
3. **Batch Processing**: Bulk modification processing
4. **Backup/Restore**: Database backup and recovery
5. **Multi-tenant**: Support for multiple organizations
6. **Audit Logging**: Comprehensive audit trail
7. **Performance Monitoring**: Real-time performance metrics

## Dependencies

- `sqlite3`: SQLite database driver
- `util`: Node.js utility functions
- `path`: File path utilities
- `fs`: File system operations

## Related Phases

- **Phase 5.1**: Linear as Primary Storage
- **Phase 4**: Linear Updates
- **Phase 3**: Slack Communication
- **Phase 2**: Core Agent Logic