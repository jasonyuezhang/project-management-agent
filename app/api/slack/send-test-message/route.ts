import { NextRequest, NextResponse } from 'next/server';
import { createSlackMCPClient } from '@/lib/mcp/slack-client';
import { createExecutionPlanMessage } from '@/lib/templates/slack-templates';
import { ExecutionPlan, LinearIssue, LinearUser, LinearTeam } from '@/lib/mcp/types';

export async function POST(request: NextRequest) {
  try {
    const { channelId, userId } = await request.json();

    if (!channelId) {
      return NextResponse.json({
        success: false,
        message: 'Channel ID is required'
      }, { status: 400 });
    }

    const slackClient = createSlackMCPClient();
    await slackClient.connect();

    // Create a mock execution plan for testing
    const mockPlan: ExecutionPlan = {
      userId: userId || 'test-user-123',
      userName: 'Test User',
      tickets: {
        finished: [
          {
            id: 'test-1',
            identifier: 'PROJ-123',
            title: 'Completed task 1',
            description: 'This task has been completed',
            state: {
              id: 'state-1',
              name: 'Done',
              type: 'completed',
              color: '#36a64f',
              position: 1
            },
            priority: 2,
            assignee: {
              id: 'user-1',
              name: 'testuser',
              email: 'test@example.com',
              displayName: 'Test User',
              avatarUrl: 'https://example.com/avatar.png'
            },
            creator: {
              id: 'user-1',
              name: 'testuser',
              email: 'test@example.com',
              displayName: 'Test User',
              avatarUrl: 'https://example.com/avatar.png'
            },
            team: {
              id: 'team-1',
              name: 'Test Team',
              key: 'TEST'
            },
            labels: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            url: 'https://linear.app/test-team/issue/PROJ-123'
          }
        ],
        inProgress: [
          {
            id: 'test-2',
            identifier: 'PROJ-124',
            title: 'In progress task',
            description: 'This task is currently in progress',
            state: {
              id: 'state-2',
              name: 'In Progress',
              type: 'started',
              color: '#f39c12',
              position: 2
            },
            priority: 3,
            assignee: {
              id: 'user-1',
              name: 'testuser',
              email: 'test@example.com',
              displayName: 'Test User',
              avatarUrl: 'https://example.com/avatar.png'
            },
            creator: {
              id: 'user-1',
              name: 'testuser',
              email: 'test@example.com',
              displayName: 'Test User',
              avatarUrl: 'https://example.com/avatar.png'
            },
            team: {
              id: 'team-1',
              name: 'Test Team',
              key: 'TEST'
            },
            labels: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            url: 'https://linear.app/test-team/issue/PROJ-124'
          }
        ],
        open: [
          {
            id: 'test-3',
            identifier: 'PROJ-125',
            title: 'Open task',
            description: 'This task is open and ready to be started',
            state: {
              id: 'state-3',
              name: 'Todo',
              type: 'unstarted',
              color: '#9b59b6',
              position: 3
            },
            priority: 1,
            assignee: {
              id: 'user-1',
              name: 'testuser',
              email: 'test@example.com',
              displayName: 'Test User',
              avatarUrl: 'https://example.com/avatar.png'
            },
            creator: {
              id: 'user-1',
              name: 'testuser',
              email: 'test@example.com',
              displayName: 'Test User',
              avatarUrl: 'https://example.com/avatar.png'
            },
            team: {
              id: 'team-1',
              name: 'Test Team',
              key: 'TEST'
            },
            labels: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            url: 'https://linear.app/test-team/issue/PROJ-125'
          }
        ]
      },
      summary: 'You have 3 total tickets: 1 completed, 1 in progress, and 1 open. Completion rate: 33%.',
      generatedAt: new Date(),
      planId: `test-plan-${Date.now()}`
    };

    // Create the message
    const message = createExecutionPlanMessage(mockPlan, channelId);

    // Send the message
    const messageId = await slackClient.sendExecutionPlanMessage(message);

    await slackClient.disconnect();

    return NextResponse.json({
      success: true,
      message: 'Test execution plan message sent successfully',
      data: {
        messageId,
        channelId,
        planId: mockPlan.planId
      }
    });
  } catch (error) {
    console.error('Failed to send test message:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to send test message',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}