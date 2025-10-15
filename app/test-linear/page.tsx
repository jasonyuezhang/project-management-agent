"use client";

import { useState } from 'react';

interface TestResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export default function TestLinearPage() {
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    setTestResult(null);
    
    try {
      const response = await fetch('/api/linear/test-connection');
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const testExecutionPlans = async () => {
    setLoading(true);
    setTestResult(null);
    
    try {
      const response = await fetch('/api/linear/execution-plans');
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const testTeamSummary = async () => {
    setLoading(true);
    setTestResult(null);
    
    try {
      // You'll need to replace this with an actual team ID
      const teamId = 'your-team-id';
      const response = await fetch(`/api/linear/team-summary?teamId=${teamId}`);
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Linear MCP Integration Test</h1>
        
        <div className="space-y-4 mb-8">
          <button
            onClick={testConnection}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-4 py-2 rounded mr-4"
          >
            {loading ? 'Testing...' : 'Test Connection'}
          </button>
          
          <button
            onClick={testExecutionPlans}
            disabled={loading}
            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white px-4 py-2 rounded mr-4"
          >
            {loading ? 'Testing...' : 'Test Execution Plans'}
          </button>
          
          <button
            onClick={testTeamSummary}
            disabled={loading}
            className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white px-4 py-2 rounded"
          >
            {loading ? 'Testing...' : 'Test Team Summary'}
          </button>
        </div>

        {testResult && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">
              Test Result: {testResult.success ? 'Success' : 'Failed'}
            </h2>
            
            {testResult.error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                <strong>Error:</strong> {testResult.error}
              </div>
            )}
            
            {testResult.data && (
              <div className="bg-gray-100 p-4 rounded">
                <h3 className="font-semibold mb-2">Data:</h3>
                <pre className="text-sm overflow-auto">
                  {JSON.stringify(testResult.data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <h3 className="font-semibold mb-2">Setup Instructions:</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Set LINEAR_API_KEY environment variable</li>
            <li>Set LINEAR_TEAM_ID environment variable</li>
            <li>Install Linear MCP server: <code className="bg-gray-200 px-1 rounded">npm install -g @linear/mcp-server</code></li>
            <li>Update team ID in the test team summary button</li>
          </ol>
        </div>
      </div>
    </div>
  );
}