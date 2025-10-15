import { NextResponse } from 'next/server';
import { createLinearMCPClient } from '@/lib/mcp/linear-client';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const client = createLinearMCPClient();
    
    // Test connection
    await client.connect();
    
    // Test basic functionality
    const teams = await client.getTeams();
    const users = await client.getUsers();
    
    await client.disconnect();
    
    return NextResponse.json({
      success: true,
      message: 'Linear MCP connection successful',
      data: {
        teamsCount: teams.length,
        usersCount: users.length,
        teams: teams.map(team => ({
          id: team.id,
          name: team.name,
          key: team.key,
        })),
        users: users.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
        })),
      },
    });
  } catch (error) {
    console.error('Linear MCP connection test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}