"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Users, 
  CheckCircle, 
  XCircle, 
  ExternalLink,
  Settings,
  Info
} from "lucide-react";
import Link from "next/link";
import { useTeamsInstallation } from "@/hooks/useTeamsInstallation";
import { LoadingContent } from "@/components/LoadingContent";
import { env } from "@/env";

export function TeamsIntegration() {
  const { data, isLoading, error } = useTeamsInstallation();
  const isTeamsEnabled = env.NEXT_PUBLIC_TEAMS_ENABLED;

  if (!isTeamsEnabled) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5" />
            <div>
              <CardTitle>Microsoft Teams</CardTitle>
              <CardDescription>
                Access Inbox Zero directly from Microsoft Teams
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <LoadingContent loading={isLoading} error={error}>
          {data?.installation ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium">Teams app installed</span>
                <Badge variant="secondary" className="ml-auto">
                  Active
                </Badge>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Organization:</span>{" "}
                  {data.installation.tenantName || data.installation.tenantId}
                </div>
                <div>
                  <span className="font-medium">Connected Email:</span>{" "}
                  {data.installation.userEmail}
                </div>
                <div>
                  <span className="font-medium">Installed:</span>{" "}
                  {new Date(data.installation.createdAt).toLocaleDateString()}
                </div>
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  You can access Inbox Zero from any Teams channel or chat by adding it as a tab.
                </AlertDescription>
              </Alert>

              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <a
                    href="https://teams.microsoft.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Teams
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/teams/setup">
                    <Settings className="h-4 w-4 mr-2" />
                    Manage Installation
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-gray-400" />
                <span className="text-gray-600">Teams app not installed</span>
              </div>
              
              <p className="text-sm text-gray-600">
                Install the Inbox Zero app in Microsoft Teams to manage your emails without leaving Teams.
              </p>

              <Button asChild>
                <Link href="/teams/setup">
                  Install Teams App
                </Link>
              </Button>
            </div>
          )}
        </LoadingContent>
      </CardContent>
    </Card>
  );
}