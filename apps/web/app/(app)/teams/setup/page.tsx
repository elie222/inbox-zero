"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Users, 
  Mail, 
  Bot, 
  Shield, 
  Zap, 
  Info,
  ExternalLink,
  CheckCircle
} from "lucide-react";
import { env } from "@/env";
import { useRouter } from "next/navigation";
import { toastError } from "@/components/Toast";

export default function TeamsSetupPage() {
  const [isInstalling, setIsInstalling] = useState(false);
  const router = useRouter();

  const isTeamsEnabled = env.NEXT_PUBLIC_TEAMS_ENABLED;

  const handleInstall = async () => {
    setIsInstalling(true);
    
    try {
      const response = await fetch("/api/teams/auth", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to start Teams authentication");
      }

      const data = await response.json();
      window.location.href = data.url;
    } catch (error) {
      toastError({
        title: "Installation Failed",
        description: "Failed to start Teams installation. Please try again.",
      });
      setIsInstalling(false);
    }
  };

  if (!isTeamsEnabled) {
    return (
      <div className="container max-w-4xl mx-auto py-8">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Microsoft Teams integration is not currently enabled. Please contact support if you need access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Install Inbox Zero for Microsoft Teams</h1>
        <p className="text-gray-600">
          Manage your emails directly from Microsoft Teams with AI-powered assistance
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Why Use Inbox Zero in Teams?</CardTitle>
          <CardDescription>
            Seamlessly integrate email management into your Teams workflow
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-4">
              <Users className="h-8 w-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-1">Team Collaboration</h3>
                <p className="text-sm text-gray-600">
                  Share email insights and collaborate on responses directly in Teams channels
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <Mail className="h-8 w-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-1">Unified Inbox</h3>
                <p className="text-sm text-gray-600">
                  Access and manage your emails without leaving Teams
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Bot className="h-8 w-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-1">AI Assistant</h3>
                <p className="text-sm text-gray-600">
                  Get AI-powered email summaries and suggested responses in Teams
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Zap className="h-8 w-8 text-primary flex-shrink-0" />
              <div>
                <h3 className="font-semibold mb-1">Quick Actions</h3>
                <p className="text-sm text-gray-600">
                  Archive, reply, and manage emails with Teams shortcuts
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Installation Steps</CardTitle>
          <CardDescription>
            Follow these steps to add Inbox Zero to your Teams workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-sm font-medium">
                1
              </span>
              <div>
                <p className="font-medium">Click Install Below</p>
                <p className="text-sm text-gray-600">You'll be redirected to Microsoft to authorize the app</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-sm font-medium">
                2
              </span>
              <div>
                <p className="font-medium">Grant Permissions</p>
                <p className="text-sm text-gray-600">Allow Inbox Zero to access your Teams workspace</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 bg-primary text-white rounded-full flex items-center justify-center text-sm font-medium">
                3
              </span>
              <div>
                <p className="font-medium">Complete Setup</p>
                <p className="text-sm text-gray-600">You'll be redirected back to complete the installation</p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Required Permissions</CardTitle>
          <CardDescription>
            Inbox Zero requests the following permissions to function properly
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">User Profile</p>
                <p className="text-sm text-gray-600">Read your basic profile information</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Teams Access</p>
                <p className="text-sm text-gray-600">Access your Teams and channels</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Shield className="h-5 w-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Email Integration</p>
                <p className="text-sm text-gray-600">Connect to your existing Inbox Zero email accounts</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Button 
          size="lg" 
          onClick={handleInstall}
          disabled={isInstalling}
          className="w-full sm:w-auto"
        >
          {isInstalling ? (
            <>Installing...</>
          ) : (
            <>
              <CheckCircle className="h-5 w-5 mr-2" />
              Install Inbox Zero for Teams
            </>
          )}
        </Button>
        
        <Button
          variant="outline"
          size="lg"
          asChild
          className="w-full sm:w-auto"
        >
          <a
            href="https://docs.getinboxzero.com/teams"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Documentation
            <ExternalLink className="h-4 w-4 ml-2" />
          </a>
        </Button>
      </div>

      <Alert className="mt-8">
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Note:</strong> You need to be a Teams administrator or have permission to install apps in your Teams workspace. 
          The app will be available to all members of your organization once installed.
        </AlertDescription>
      </Alert>
    </div>
  );
}