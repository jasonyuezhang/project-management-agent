import { NextRequest, NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('teamId');
    
    const client = createLinearMCPClient();
    await client.connect();
    
    const plans = await client.generateExecutionPlans(teamId || undefined);
    
    await client.disconnect();
    
    return NextResponse.json({
      success: true,
      data: {
        plans,
        generatedAt: new Date().toISOString(),
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
    const { teamId, userId } = body;
    
    const client = createLinearMCPClient();
    await client.connect();
    
    let plans;
    if (userId) {
      // Generate plan for specific user
      const userTickets = await client.getTicketsByAssignee(userId);
      const user = (await client.getUsers()).find(u => u.id === userId);
      
      if (!user) {
        throw new Error('User not found');
      }
      
      const finished = userTickets.filter(ticket => 
        ticket.state.type === 'completed'
      );
      const inProgress = userTickets.filter(ticket => 
        ticket.state.type === 'started'
      );
      const open = userTickets.filter(ticket => 
        ['backlog', 'unstarted'].includes(ticket.state.type)
      );
      
      const summary = `You have ${userTickets.length} total tickets: ${finished.length} completed, ${inProgress.length} in progress, and ${open.length} open.`;
      
      plans = [{
        userId: user.id,
        userName: user.displayName,
        tickets: { finished, inProgress, open },
        summary,
        generatedAt: new Date(),
        planId: `plan_${user.id}_${Date.now()}`,
      }];
    } else {
      plans = await client.generateExecutionPlans(teamId);
    }
    
    await client.disconnect();
    
    return NextResponse.json({
      success: true,
      data: {
        plans,
        generatedAt: new Date().toISOString(),
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