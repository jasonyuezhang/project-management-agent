import { NextRequest, NextResponse } from 'next/server';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';

export async function GET(request: NextRequest) {
  try {
    const slackClient = createSlackMCPClient();
    
    // Test connection
    await slackClient.connect();
    
    // Test getting users
    const users = await slackClient.getUsers();
    
    // Test getting channels
    const channels = await slackClient.getChannels();
    
    // Test getting user groups
    const userGroups = await slackClient.getUserGroups();
    
    await slackClient.disconnect();

    return NextResponse.json({
      success: true,
      message: 'Slack MCP connection successful',
      data: {
        usersCount: users.length,
        channelsCount: channels.length,
        userGroupsCount: userGroups.length,
        sampleUsers: users.slice(0, 3).map(user => ({
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          email: user.email
        })),
        sampleChannels: channels.slice(0, 3).map(channel => ({
          id: channel.id,
          name: channel.name,
          isPrivate: channel.isPrivate,
          numMembers: channel.numMembers
        }))
      }
    });
  } catch (error) {
    console.error('Slack MCP connection test failed:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Slack MCP connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}