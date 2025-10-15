import { NextRequest, NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';
import { createPlanGenerator } from '@/lib/plan-generator';
import { createConfigManager } from '@/lib/config/agent-config';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    
    if (!teamId) {
      return NextResponse.json({
        success: false,
        error: 'Team ID is required',
      }, { status: 400 });
    }
    
    const configManager = createConfigManager();
    const config = configManager.getPlanGenerationConfig();
    
    const client = createLinearMCPClient();
    const planGenerator = createPlanGenerator(client, {
      teamId,
      includeCompletedTickets: config.includeCompletedTickets,
      includeCanceledTickets: config.includeCanceledTickets,
      maxTicketsPerUser: config.maxTicketsPerUser,
    });
    
    const summary = await planGenerator.generateTeamSummary(teamId);
    
    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Failed to generate team summary:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}