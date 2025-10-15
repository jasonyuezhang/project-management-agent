'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle, MessageSquare } from 'lucide-react';

interface TestResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export default function TestSlackPage() {
  const [channelId, setChannelId] = useState('');
  const [userId, setUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const addResult = (result: TestResult) => {
    setTestResults(prev => [result, ...prev]);
  };

  const testConnection = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/slack/test-connection');
      const result = await response.json();
      addResult(result);
    } catch (error) {
      addResult({
        success: false,
        message: 'Failed to test connection',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestMessage = async () => {
    if (!channelId) {
      addResult({
        success: false,
        message: 'Channel ID is required'
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/slack/send-test-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId, userId }),
      });
      const result = await response.json();
      addResult(result);
    } catch (error) {
      addResult({
        success: false,
        message: 'Failed to send test message',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Slack MCP Integration Test</h1>
          <p className="text-muted-foreground mt-2">
            Test the Slack MCP integration and send sample execution plan messages.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Test Configuration
              </CardTitle>
              <CardDescription>
                Configure the test parameters for Slack integration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="channelId">Channel ID</Label>
                <Input
                  id="channelId"
                  placeholder="C1234567890"
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  The Slack channel ID where messages will be sent.
                </p>
              </div>
              <div>
                <Label htmlFor="userId">User ID (Optional)</Label>
                <Input
                  id="userId"
                  placeholder="U1234567890"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  The Slack user ID for the execution plan (optional).
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Actions</CardTitle>
              <CardDescription>
                Run tests to verify the Slack MCP integration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={testConnection}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Test Connection
              </Button>
              <Button
                onClick={sendTestMessage}
                disabled={isLoading || !channelId}
                variant="outline"
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Send Test Message
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              View the results of your Slack integration tests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {testResults.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No tests run yet. Click a test button above to get started.
              </p>
            ) : (
              <div className="space-y-4">
                {testResults.map((result, index) => (
                  <Alert key={index} variant={result.success ? 'default' : 'destructive'}>
                    <div className="flex items-start gap-2">
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <AlertDescription>
                          <div className="font-medium">{result.message}</div>
                          {result.error && (
                            <div className="text-sm text-red-600 mt-1">
                              Error: {result.error}
                            </div>
                          )}
                          {result.data && (
                            <div className="text-sm text-muted-foreground mt-2">
                              <pre className="bg-muted p-2 rounded text-xs overflow-auto">
                                {JSON.stringify(result.data, null, 2)}
                              </pre>
                            </div>
                          )}
                        </AlertDescription>
                      </div>
                    </div>
                  </Alert>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Environment Variables</CardTitle>
            <CardDescription>
              Make sure these environment variables are set for Slack integration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="font-mono bg-muted p-2 rounded">
                SLACK_BOT_TOKEN=xoxb-your-bot-token
              </div>
              <div className="font-mono bg-muted p-2 rounded">
                SLACK_APP_TOKEN=xapp-your-app-token
              </div>
              <div className="font-mono bg-muted p-2 rounded">
                SLACK_SIGNING_SECRET=your_signing_secret
              </div>
              <div className="font-mono bg-muted p-2 rounded">
                SLACK_SUMMARY_CHANNEL_ID=C1234567890
              </div>
              <div className="font-mono bg-muted p-2 rounded">
                SLACK_ADMIN_CHANNEL_ID=C1234567890
              </div>
              <div className="font-mono bg-muted p-2 rounded">
                SLACK_SUMMARY_USER_GROUP_ID=S1234567890
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}