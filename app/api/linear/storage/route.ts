import { NextRequest, NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client.js';
import { createLinearUpdater } from '@/lib/updaters/linear-updater.js';
import { createLinearStorageService, LinearStorageConfig } from '@/lib/services/linear-storage-service.js';
import { createConfigManager } from '@/lib/config/agent-config.js';
import { logger } from '@/lib/monitoring/logger.js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, teamId, planId, ticketId } = body;

    const configManager = createConfigManager();
    const config = configManager.getConfig();

    // Create Linear client
    const linearClient = createLinearMCPClient();
    await linearClient.connect();

    // Create storage configuration
    const storageConfig: LinearStorageConfig = {
      customFieldIds: config.linear.customFields,
      teamId: teamId || config.linear.teamId,
      enableComments: true,
      enableCustomFields: true,
    };

    // Create storage service
    const storageService = createLinearStorageService(linearClient, storageConfig);

    // Create updater with storage
    const updater = createLinearUpdater(linearClient, {}, storageConfig);

    let result;

    switch (action) {
      case 'store_plan':
        const { plan } = body;
        if (!plan) {
          return NextResponse.json({ error: 'Plan data is required' }, { status: 400 });
        }
        
        result = await storageService.storeExecutionPlan(plan);
        break;

      case 'store_plans':
        const { plans } = body;
        if (!plans || !Array.isArray(plans)) {
          return NextResponse.json({ error: 'Plans array is required' }, { status: 400 });
        }
        
        result = await storageService.storeExecutionPlans(plans);
        break;

      case 'get_metadata':
        if (!ticketId) {
          return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
        }
        
        result = await storageService.getExecutionPlanMetadata(ticketId);
        break;

      case 'find_tickets':
        if (!planId) {
          return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
        }
        
        result = await storageService.findTicketsByExecutionPlan(planId);
        break;

      case 'cleanup':
        const { olderThanDays = 30 } = body;
        result = await storageService.cleanupOldExecutionPlans(olderThanDays);
        break;

      case 'stats':
        result = await storageService.getStorageStats();
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await linearClient.disconnect();

    return NextResponse.json({
      success: true,
      action,
      result,
    });

  } catch (error) {
    logger.error('Linear storage API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    const teamId = searchParams.get('teamId');
    const ticketId = searchParams.get('ticketId');
    const planId = searchParams.get('planId');

    const configManager = createConfigManager();
    const config = configManager.getConfig();

    // Create Linear client
    const linearClient = createLinearMCPClient();
    await linearClient.connect();

    // Create storage configuration
    const storageConfig: LinearStorageConfig = {
      customFieldIds: config.linear.customFields,
      teamId: teamId || config.linear.teamId,
      enableComments: true,
      enableCustomFields: true,
    };

    // Create storage service
    const storageService = createLinearStorageService(linearClient, storageConfig);

    let result;

    switch (action) {
      case 'metadata':
        if (!ticketId) {
          return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
        }
        result = await storageService.getExecutionPlanMetadata(ticketId);
        break;

      case 'find_tickets':
        if (!planId) {
          return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
        }
        result = await storageService.findTicketsByExecutionPlan(planId);
        break;

      case 'stats':
      default:
        result = await storageService.getStorageStats();
        break;
    }

    await linearClient.disconnect();

    return NextResponse.json({
      success: true,
      action,
      result,
    });

  } catch (error) {
    logger.error('Linear storage API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
