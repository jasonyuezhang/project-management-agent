import { createSessionManagementService } from '../lib/services/session-management-service.js';
import { createExecutionSessionIntegration } from '../lib/services/execution-session-integration.js';

// Example usage of Phase 5.2: Local Storage for Session Management

async function demonstrateSessionManagement() {
  console.log('=== Phase 5.2: Local Storage for Session Management Demo ===\n');

  // Initialize session management service
  const sessionService = createSessionManagementService({
    databasePath: './data/sessions.db',
    autoCleanupDays: 30
  });

  try {
    // 1. Create an execution session
    console.log('1. Creating execution session...');
    const session = await sessionService.createExecutionSession({
      adminUserId: 'admin-123',
      teamId: 'team-456',
      planCount: 5
    });
    console.log(`   Created session: ${session.id}`);
    console.log(`   Status: ${session.status}`);
    console.log(`   Plan count: ${session.planCount}\n`);

    // 2. Add plan modifications
    console.log('2. Adding plan modifications...');
    const modifications = [
      {
        ticketId: 'ticket-1',
        userId: 'user-1',
        action: 'status_change' as const,
        value: 'in_progress'
      },
      {
        ticketId: 'ticket-2',
        userId: 'user-2',
        action: 'reassign' as const,
        value: 'user-3'
      },
      {
        ticketId: 'ticket-3',
        userId: 'user-1',
        action: 'comment' as const,
        value: 'Updated requirements'
      }
    ];

    const modResults = await sessionService.bulkCreateModifications(session.id, modifications);
    console.log(`   Added ${modResults.length} modifications\n`);

    // 3. Get session modifications
    console.log('3. Retrieving session modifications...');
    const sessionMods = await sessionService.getSessionModifications(session.id);
    console.log(`   Found ${sessionMods.length} modifications for session ${session.id}\n`);

    // 4. Confirm session
    console.log('4. Confirming session...');
    const confirmed = await sessionService.confirmSession(session.id);
    console.log(`   Session confirmed: ${confirmed}\n`);

    // 5. Process modifications
    console.log('5. Processing modifications...');
    const processResult = await sessionService.processModifications(session.id);
    console.log(`   Processed: ${processResult.processed}`);
    console.log(`   Errors: ${processResult.errors}\n`);

    // 6. Complete session
    console.log('6. Completing session...');
    const completed = await sessionService.completeSession(session.id);
    console.log(`   Session completed: ${completed}\n`);

    // 7. Get session stats
    console.log('7. Getting session statistics...');
    const stats = await sessionService.getSessionStats();
    console.log(`   Total sessions: ${stats.totalSessions}`);
    console.log(`   Pending sessions: ${stats.pendingSessions}`);
    console.log(`   Confirmed sessions: ${stats.confirmedSessions}`);
    console.log(`   Completed sessions: ${stats.completedSessions}`);
    console.log(`   Total modifications: ${stats.totalModifications}`);
    console.log(`   Processed modifications: ${stats.processedModifications}\n`);

    // 8. Get modification stats for session
    console.log('8. Getting modification statistics...');
    const modStats = await sessionService.getModificationStats(session.id);
    console.log(`   Total modifications: ${modStats.total}`);
    console.log(`   By action:`, modStats.byAction);
    console.log(`   By user:`, modStats.byUser);
    console.log(`   Processed: ${modStats.processed}`);
    console.log(`   Pending: ${modStats.pending}`);
    console.log(`   Errors: ${modStats.errors}\n`);

  } catch (error) {
    console.error('Error in session management demo:', error);
  } finally {
    // Clean up
    await sessionService.close();
  }
}

async function demonstrateIntegrationService() {
  console.log('=== Execution Session Integration Demo ===\n');

  // Initialize integration service
  const integration = createExecutionSessionIntegration({
    sessionManagement: {
      databasePath: './data/sessions.db',
      autoCleanupDays: 30
    },
    linear: {
      apiKey: process.env.LINEAR_API_KEY || 'test-key',
      teamId: process.env.LINEAR_TEAM_ID || 'test-team'
    },
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN || 'test-token',
      appToken: process.env.SLACK_APP_TOKEN || 'test-app-token',
      signingSecret: process.env.SLACK_SIGNING_SECRET || 'test-secret'
    }
  });

  try {
    // 1. Create execution session with integration
    console.log('1. Creating execution session with integration...');
    const createResult = await integration.createExecutionSession('admin-123', 'team-456');
    console.log(`   Session ID: ${createResult.sessionId}`);
    console.log(`   Status: ${createResult.status}`);
    console.log(`   Plan count: ${createResult.planCount}`);
    console.log(`   Errors: ${createResult.errors.length}\n`);

    // 2. Process user modification
    console.log('2. Processing user modification...');
    const modifyResult = await integration.processUserModification(
      createResult.sessionId,
      'user-1',
      'ticket-1',
      'status_change',
      'in_progress'
    );
    console.log(`   Modification successful: ${modifyResult.success}`);
    if (modifyResult.error) {
      console.log(`   Error: ${modifyResult.error}`);
    }
    console.log();

    // 3. Confirm session
    console.log('3. Confirming session...');
    const confirmResult = await integration.confirmSession(createResult.sessionId);
    console.log(`   Session confirmed: ${confirmResult.status}`);
    console.log(`   Modifications processed: ${confirmResult.processedModifications}`);
    console.log(`   Errors: ${confirmResult.errors.length}\n`);

    // 4. Complete session
    console.log('4. Completing session...');
    const completeResult = await integration.completeSession(createResult.sessionId);
    console.log(`   Session completed: ${completeResult.status}`);
    console.log(`   Total modifications: ${completeResult.modificationCount}`);
    console.log(`   Processed modifications: ${completeResult.processedModifications}\n`);

    // 5. Get active sessions
    console.log('5. Getting active sessions...');
    const activeSessions = await integration.getActiveSessions();
    console.log(`   Active sessions: ${activeSessions.length}\n`);

    // 6. Get session stats
    console.log('6. Getting integration statistics...');
    const stats = await integration.getSessionStats();
    console.log(`   Total sessions: ${stats.totalSessions}`);
    console.log(`   Active sessions: ${stats.activeSessions}`);
    console.log(`   Completed sessions: ${stats.completedSessions}`);
    console.log(`   Total modifications: ${stats.totalModifications}`);
    console.log(`   Processed modifications: ${stats.processedModifications}\n`);

  } catch (error) {
    console.error('Error in integration demo:', error);
  } finally {
    // Clean up
    await integration.close();
  }
}

async function demonstrateAPICalls() {
  console.log('=== API Endpoints Demo ===\n');

  const baseUrl = 'http://localhost:3000/api/sessions';

  try {
    // 1. Create session via API
    console.log('1. Creating session via API...');
    const createResponse = await fetch(`${baseUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        adminUserId: 'admin-123',
        teamId: 'team-456'
      })
    });
    const createResult = await createResponse.json();
    console.log(`   Session created: ${createResult.sessionId}`);
    console.log(`   Status: ${createResult.status}\n`);

    // 2. Add modification via API
    console.log('2. Adding modification via API...');
    const modifyResponse = await fetch(`${baseUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'modify',
        sessionId: createResult.sessionId,
        userId: 'user-1',
        ticketId: 'ticket-1',
        actionType: 'status_change',
        value: 'in_progress'
      })
    });
    const modifyResult = await modifyResponse.json();
    console.log(`   Modification successful: ${modifyResult.success}\n`);

    // 3. Get session status via API
    console.log('3. Getting session status via API...');
    const statusResponse = await fetch(`${baseUrl}?action=status&sessionId=${createResult.sessionId}`);
    const statusResult = await statusResponse.json();
    console.log(`   Session status: ${statusResult.status}`);
    console.log(`   Plan count: ${statusResult.planCount}\n`);

    // 4. Get active sessions via API
    console.log('4. Getting active sessions via API...');
    const activeResponse = await fetch(`${baseUrl}?action=active`);
    const activeResult = await activeResponse.json();
    console.log(`   Active sessions: ${activeResult.length}\n`);

    // 5. Get stats via API
    console.log('5. Getting statistics via API...');
    const statsResponse = await fetch(`${baseUrl}?action=stats`);
    const statsResult = await statsResponse.json();
    console.log(`   Total sessions: ${statsResult.totalSessions}`);
    console.log(`   Active sessions: ${statsResult.activeSessions}`);
    console.log(`   Completed sessions: ${statsResult.completedSessions}\n`);

  } catch (error) {
    console.error('Error in API demo (server may not be running):', error);
  }
}

// Run demonstrations
async function main() {
  console.log('Phase 5.2: Local Storage for Session Management\n');
  console.log('This phase implements SQLite-based session management for execution plans.\n');

  await demonstrateSessionManagement();
  await demonstrateIntegrationService();
  await demonstrateAPICalls();

  console.log('=== Demo Complete ===');
  console.log('\nKey Features Implemented:');
  console.log('✓ SQLite database schema for execution sessions and plan modifications');
  console.log('✓ Session management service with full CRUD operations');
  console.log('✓ Plan modification tracking and processing');
  console.log('✓ Integration with existing Linear and Slack services');
  console.log('✓ REST API endpoints for session management');
  console.log('✓ Comprehensive error handling and validation');
  console.log('✓ Session lifecycle management (create → confirm → complete)');
  console.log('✓ Statistics and monitoring capabilities');
  console.log('✓ Automatic cleanup of old sessions');
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { demonstrateSessionManagement, demonstrateIntegrationService, demonstrateAPICalls };