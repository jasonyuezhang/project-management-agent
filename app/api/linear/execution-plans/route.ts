import { NextRequest, NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';
import { createPlanGenerator } from '@/lib/plan-generator';
import { createConfigManager } from '@/lib/config/agent-config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    
    const configManager = createConfigManager();
    const config = configManager.getPlanGenerationConfig();
    
    const client = createLinearMCPClient();
    const planGenerator = createPlanGenerator(client, {
      teamId: teamId || undefined,
      includeCompletedTickets: config.includeCompletedTickets,
      includeCanceledTickets: config.includeCanceledTickets,
      maxTicketsPerUser: config.maxTicketsPerUser,
    });
    
    const plans = await planGenerator.generateIndividualPlans(teamId || undefined);
    
    return NextResponse.json({
      success: true,
      data: {
        plans,
        generatedAt: new Date().toISOString(),
        config: {
          includeCompletedTickets: config.includeCompletedTickets,
          includeCanceledTickets: config.includeCanceledTickets,
          maxTicketsPerUser: config.maxTicketsPerUser,
        },
      },
    });
  } catch (error) {
    console.error('Failed to generate execution plans:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { teamId, userId, config: customConfig } = body;
    
    const configManager = createConfigManager();
    const baseConfig = configManager.getPlanGenerationConfig();
    
    const client = createLinearMCPClient();
    const planGenerator = createPlanGenerator(client, {
      teamId: teamId || undefined,
      includeCompletedTickets: customConfig?.includeCompletedTickets ?? baseConfig.includeCompletedTickets,
      includeCanceledTickets: customConfig?.includeCanceledTickets ?? baseConfig.includeCanceledTickets,
      maxTicketsPerUser: customConfig?.maxTicketsPerUser ?? baseConfig.maxTicketsPerUser,
    });
    
    let plans;
    if (userId) {
      // Generate plan for specific user
      const users = await client.getUsers();
      const user = users.find(u => u.id === userId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      const plan = await planGenerator.generateUserPlan(user, teamId);
      plans = plan ? [plan] : [];
    } else {
      plans = await planGenerator.generateIndividualPlans(teamId);
    }
    
    return NextResponse.json({
      success: true,
      data: {
        plans,
        generatedAt: new Date().toISOString(),
        config: {
          includeCompletedTickets: planGenerator.getConfig().includeCompletedTickets,
          includeCanceledTickets: planGenerator.getConfig().includeCanceledTickets,
          maxTicketsPerUser: planGenerator.getConfig().maxTicketsPerUser,
        },
      },
    });
  } catch (error) {
    console.error('Failed to generate execution plans:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}