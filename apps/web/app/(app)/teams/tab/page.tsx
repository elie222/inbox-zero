"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Inbox,
  Archive,
  Send,
  Clock,
  BarChart3,
  Mail,
  Loader2,
  ExternalLink,
  Info,
} from "lucide-react";
import Link from "next/link";
import { useEmailAccounts } from "@/hooks/useEmailAccounts";
import { LoadingContent } from "@/components/LoadingContent";
import * as microsoftTeams from "@microsoft/teams-js";

// Simple stats component for Teams tab
function EmailStats({ accountId }: { accountId: string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-sm text-gray-600">Inbox</p>
              <p className="text-2xl font-semibold">--</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-sm text-gray-600">Archived Today</p>
              <p className="text-2xl font-semibold">--</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-sm text-gray-600">Sent Today</p>
              <p className="text-2xl font-semibold">--</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-sm text-gray-600">Avg Response</p>
              <p className="text-2xl font-semibold">--</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TeamsTabPage() {
  const [isInTeams, setIsInTeams] = useState<boolean | null>(null); // null = checking
  const [context, setContext] = useState<any>(null);
  const { data: accounts, isLoading, error } = useEmailAccounts();

  useEffect(() => {
    // Check if we're running inside Teams
    const initializeTeams = async () => {
      try {
        await microsoftTeams.app.initialize();
        setIsInTeams(true);
        
        // Get Teams context
        const context = await microsoftTeams.app.getContext();
        setContext(context);
      } catch (error) {
        // Not running in Teams
        console.log("Not running in Teams environment");
        setIsInTeams(false);
      }
    };

    initializeTeams();
  }, []);

  const primaryAccount = accounts?.emailAccounts?.[0];

  // Show loading while checking Teams environment
  if (isInTeams === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isInTeams) {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This page is designed to be viewed within Microsoft Teams. 
            Please access it through the Inbox Zero Teams app.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button asChild>
            <Link href="/settings">Go to Settings</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="p-4 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Inbox Zero</h1>
          <p className="text-gray-600">
            Manage your emails with AI assistance
          </p>
        </div>

        {!primaryAccount ? (
          <Card>
            <CardHeader>
              <CardTitle>Connect Your Email</CardTitle>
              <CardDescription>
                You need to connect an email account to use Inbox Zero in Teams
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <a href="/accounts" target="_blank" rel="noopener noreferrer">
                  Connect Email Account
                  <ExternalLink className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  {primaryAccount.email}
                </CardTitle>
                <CardDescription>
                  Your primary email account
                </CardDescription>
              </CardHeader>
            </Card>

            <EmailStats accountId={primaryAccount.id} />

            <Tabs defaultValue="inbox" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="inbox">Inbox</TabsTrigger>
                <TabsTrigger value="assistant">AI Assistant</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="settings">Quick Actions</TabsTrigger>
              </TabsList>

              <TabsContent value="inbox">
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Emails</CardTitle>
                    <CardDescription>
                      Your most recent email threads
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8 text-gray-500">
                      <Mail className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Email preview coming soon</p>
                      <Button asChild className="mt-4">
                        <a 
                          href={`/${primaryAccount.id}/mail`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          Open Full Inbox
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="assistant">
                <Card>
                  <CardHeader>
                    <CardTitle>AI Assistant</CardTitle>
                    <CardDescription>
                      Get help writing and managing emails
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Button asChild className="w-full" variant="outline">
                        <a 
                          href={`/${primaryAccount.id}/assistant`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          Open AI Assistant
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                      <Button asChild className="w-full" variant="outline">
                        <a 
                          href={`/${primaryAccount.id}/compose`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          Compose with AI
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analytics">
                <Card>
                  <CardHeader>
                    <CardTitle>Email Analytics</CardTitle>
                    <CardDescription>
                      Track your email productivity
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-8">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-gray-500">Analytics integration coming soon</p>
                      <Button asChild className="mt-4" variant="outline">
                        <a 
                          href={`/${primaryAccount.id}/stats`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          View Full Analytics
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="settings">
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>
                      Common email management tasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      <Button asChild variant="outline">
                        <a 
                          href={`/${primaryAccount.id}/bulk-unsubscribe`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          Bulk Unsubscribe
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                      <Button asChild variant="outline">
                        <a 
                          href={`/${primaryAccount.id}/clean`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          Clean Inbox
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                      <Button asChild variant="outline">
                        <a 
                          href={`/${primaryAccount.id}/automation`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          Setup Automation
                          <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {context && (
          <div className="mt-6 text-xs text-gray-500">
            Teams Context: {context.user?.userPrincipalName || context.user?.id} | {context.team?.displayName || "Personal"}
          </div>
        )}
      </div>
    </LoadingContent>
  );
}