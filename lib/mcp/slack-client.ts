import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  SlackUser,
  SlackChannel,
  SlackMessage,
  SlackReply,
  InteractiveMessage,
  SlackMCPResponse,
  SlackExecutionPlanMessage,
  SlackTeamSummaryMessage,
  SlackUserGroup,
  PlanModification,
  ValidationResult
} from './slack-types.js';

export interface SlackMCPClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendDirectMessage(userId: string, message: SlackMessage): Promise<void>;
  sendChannelMessage(channelId: string, message: SlackMessage): Promise<void>;
  sendExecutionPlanMessage(message: SlackExecutionPlanMessage): Promise<string>;
  sendTeamSummaryMessage(message: SlackTeamSummaryMessage): Promise<string>;
  listenForReplies(messageId: string, timeoutMs?: number): Promise<SlackReply[]>;
  createInteractiveMessage(message: InteractiveMessage): Promise<string>;
  getUsers(): Promise<SlackUser[]>;
  getChannels(): Promise<SlackChannel[]>;
  getUserGroups(): Promise<SlackUserGroup[]>;
  getUserByEmail(email: string): Promise<SlackUser | null>;
  getChannelByName(name: string): Promise<SlackChannel | null>;
  parseUserReply(reply: string, userId: string): Promise<PlanModification[]>;
  validateModifications(modifications: PlanModification[]): Promise<ValidationResult>;
}

export class SlackMCPClientImpl implements SlackMCPClient {
  private client: Client;
  private isConnected: boolean = false;

  constructor() {
    this.client = new Client(
      {
        name: 'project-management-agent-slack',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['@slack/mcp-server'],
        env: {
          SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
          SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN || '',
          SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',
        },
      });

      await this.client.connect(transport);
      this.isConnected = true;
    } catch (error) {
      console.error('Failed to connect to Slack MCP server:', error);
      throw new Error('Failed to connect to Slack MCP server');
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }

  async sendDirectMessage(userId: string, message: SlackMessage): Promise<void> {
    await this.ensureConnected();
    
    try {
      await this.client.callTool({
        name: 'send_direct_message',
        arguments: {
          userId,
          message,
        },
      });
    } catch (error) {
      console.error('Error sending direct message:', error);
      throw new Error('Failed to send direct message');
    }
  }

  async sendChannelMessage(channelId: string, message: SlackMessage): Promise<void> {
    await this.ensureConnected();
    
    try {
      await this.client.callTool({
        name: 'send_channel_message',
        arguments: {
          channelId,
          message,
        },
      });
    } catch (error) {
      console.error('Error sending channel message:', error);
      throw new Error('Failed to send channel message');
    }
  }

  async sendExecutionPlanMessage(message: SlackExecutionPlanMessage): Promise<string> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'send_execution_plan_message',
        arguments: message,
      });

      const data = this.parseMCPResponse<{ messageId: string }>(result);
      return data?.messageId || '';
    } catch (error) {
      console.error('Error sending execution plan message:', error);
      throw new Error('Failed to send execution plan message');
    }
  }

  async sendTeamSummaryMessage(message: SlackTeamSummaryMessage): Promise<string> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'send_team_summary_message',
        arguments: message,
      });

      const data = this.parseMCPResponse<{ messageId: string }>(result);
      return data?.messageId || '';
    } catch (error) {
      console.error('Error sending team summary message:', error);
      throw new Error('Failed to send team summary message');
    }
  }

  async listenForReplies(messageId: string, timeoutMs: number = 300000): Promise<SlackReply[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'listen_for_replies',
        arguments: {
          messageId,
          timeoutMs,
        },
      });

      const data = this.parseMCPResponse<{ replies: SlackReply[] }>(result);
      return data?.replies || [];
    } catch (error) {
      console.error('Error listening for replies:', error);
      throw new Error('Failed to listen for replies');
    }
  }

  async createInteractiveMessage(message: InteractiveMessage): Promise<string> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'create_interactive_message',
        arguments: message,
      });

      const data = this.parseMCPResponse<{ messageId: string }>(result);
      return data?.messageId || '';
    } catch (error) {
      console.error('Error creating interactive message:', error);
      throw new Error('Failed to create interactive message');
    }
  }

  async getUsers(): Promise<SlackUser[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_users',
        arguments: {},
      });

      const data = this.parseMCPResponse<{ users: SlackUser[] }>(result);
      return data?.users || [];
    } catch (error) {
      console.error('Error fetching users:', error);
      throw new Error('Failed to fetch users');
    }
  }

  async getChannels(): Promise<SlackChannel[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_channels',
        arguments: {},
      });

      const data = this.parseMCPResponse<{ channels: SlackChannel[] }>(result);
      return data?.channels || [];
    } catch (error) {
      console.error('Error fetching channels:', error);
      throw new Error('Failed to fetch channels');
    }
  }

  async getUserGroups(): Promise<SlackUserGroup[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_user_groups',
        arguments: {},
      });

      const data = this.parseMCPResponse<{ userGroups: SlackUserGroup[] }>(result);
      return data?.userGroups || [];
    } catch (error) {
      console.error('Error fetching user groups:', error);
      throw new Error('Failed to fetch user groups');
    }
  }

  async getUserByEmail(email: string): Promise<SlackUser | null> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_user_by_email',
        arguments: { email },
      });

      const data = this.parseMCPResponse<{ user: SlackUser }>(result);
      return data?.user || null;
    } catch (error) {
      console.error('Error fetching user by email:', error);
      throw new Error('Failed to fetch user by email');
    }
  }

  async getChannelByName(name: string): Promise<SlackChannel | null> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'get_channel_by_name',
        arguments: { name },
      });

      const data = this.parseMCPResponse<{ channel: SlackChannel }>(result);
      return data?.channel || null;
    } catch (error) {
      console.error('Error fetching channel by name:', error);
      throw new Error('Failed to fetch channel by name');
    }
  }

  async parseUserReply(reply: string, userId: string): Promise<PlanModification[]> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'parse_user_reply',
        arguments: {
          reply,
          userId,
        },
      });

      const data = this.parseMCPResponse<{ modifications: PlanModification[] }>(result);
      return data?.modifications || [];
    } catch (error) {
      console.error('Error parsing user reply:', error);
      throw new Error('Failed to parse user reply');
    }
  }

  async validateModifications(modifications: PlanModification[]): Promise<ValidationResult> {
    await this.ensureConnected();
    
    try {
      const result = await this.client.callTool({
        name: 'validate_modifications',
        arguments: { modifications },
      });

      const data = this.parseMCPResponse<ValidationResult>(result);
      return data || { isValid: false, errors: ['Failed to validate modifications'], warnings: [], modifications: [] };
    } catch (error) {
      console.error('Error validating modifications:', error);
      throw new Error('Failed to validate modifications');
    }
  }

  private parseMCPResponse<T>(result: unknown): T | null {
    interface MCPResponse {
      content?: Array<{ type: string; text: string }>;
    }
    
    const mcpResult = result as MCPResponse;
    if (
      mcpResult && 
      mcpResult.content && 
      Array.isArray(mcpResult.content) && 
      mcpResult.content[0]?.type === 'text'
    ) {
      try {
        return JSON.parse(mcpResult.content[0].text);
      } catch (error) {
        console.error('Failed to parse MCP response:', error);
        return null;
      }
    }
    return null;
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
    }
  }
}

// Factory function to create a Slack MCP client
export function createSlackMCPClient(): SlackMCPClient {
  return new SlackMCPClientImpl();
}