"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { signIn } from "@/utils/auth-client";
import { SCOPES } from "@/utils/gmail/scopes";

export default function ForceRelinkPage() {
  const [isRelinking, setIsRelinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRelink = async () => {
    setIsRelinking(true);
    setError(null);

    try {
      // Use Better Auth's signIn to re-authenticate with Google
      // This will properly update the existing account
      await signIn.social({
        provider: "google",
        callbackURL: "/accounts?relinked=true",
        scopes: [...SCOPES],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsRelinking(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Force Google Account Re-authentication</CardTitle>
          <CardDescription>
            Use this page to force re-link your Google account when tokens are
            missing or corrupted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Debug Mode</AlertTitle>
            <AlertDescription>
              This will trigger a full re-authentication with Google, which
              should refresh your access and refresh tokens.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Current issue: Your Google account tokens are missing from the
              database.
            </p>
            <p className="text-sm text-muted-foreground">
              Clicking the button below will:
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>Redirect you to Google OAuth</li>
              <li>Request fresh access and refresh tokens</li>
              <li>Save the new tokens to the database</li>
            </ul>
          </div>

          <Button
            onClick={handleRelink}
            disabled={isRelinking}
            className="w-full"
          >
            {isRelinking ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Redirecting to Google...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-authenticate with Google
              </>
            )}
          </Button>

          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              After re-authentication, check the logs with:
            </p>
            <code className="block mt-2 p-2 bg-muted rounded text-xs">
              sudo journalctl -u inbox-zero -f | grep -E "linkAccount|Account
              data"
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
