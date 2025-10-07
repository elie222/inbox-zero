'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function OAuthDebugPage() {
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [authCode, setAuthCode] = useState('');
  const [tokenResult, setTokenResult] = useState<Record<string, unknown> | null>(null);

  const fetchDebugInfo = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/debug-oauth');
      const data = await response.json();
      setDebugInfo(data);
    } catch (error) {
      console.error('Failed to fetch debug info:', error);
    } finally {
      setLoading(false);
    }
  };

  const testTokenExchange = async () => {
    if (!authCode.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/debug-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: authCode }),
      });
      const data = await response.json();
      setTokenResult(data);
    } catch (error) {
      console.error('Token exchange failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">OAuth Debug Tool</h1>
      
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Environment Debug</CardTitle>
            <CardDescription>
              Check your OAuth configuration and environment variables
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={fetchDebugInfo} disabled={loading}>
              {loading ? 'Loading...' : 'Fetch Debug Info'}
            </Button>
            
            {debugInfo && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Debug Information:</h3>
                <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
                  {JSON.stringify(debugInfo.debug, null, 2)}
                </pre>
                
                <div className="mt-4">
                  <h3 className="text-lg font-semibold mb-2">Test Auth URL:</h3>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm break-all">{String(debugInfo.testAuthUrl)}</p>
                    <Button 
                      className="mt-2" 
                      onClick={() => window.open(String(debugInfo.testAuthUrl), '_blank')}
                    >
                      Open Auth URL
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Token Exchange Test</CardTitle>
            <CardDescription>
              Test exchanging authorization code for access token
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="authCode">Authorization Code</Label>
                <Input
                  id="authCode"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Paste authorization code here"
                />
              </div>
              
              <Button onClick={testTokenExchange} disabled={loading || !authCode.trim()}>
                {loading ? 'Testing...' : 'Test Token Exchange'}
              </Button>
              
              {tokenResult && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold mb-2">Token Exchange Result:</h3>
                  <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
                    {JSON.stringify(tokenResult, null, 2)}
                  </pre>
                  
                  {tokenResult.success ? (
                    <Alert className="mt-4">
                      <AlertDescription>
                        ✅ Token exchange successful! OAuth configuration is working.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert className="mt-4" variant="destructive">
                      <AlertDescription>
                        ❌ Token exchange failed. Check the error details above.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Click "Fetch Debug Info" to see your current OAuth configuration</li>
              <li>Click "Open Auth URL" to test the OAuth flow in a new tab</li>
              <li>Complete the OAuth flow and copy the authorization code from the redirect URL</li>
              <li>Paste the code in the "Authorization Code" field</li>
              <li>Click "Test Token Exchange" to verify the complete OAuth flow</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
