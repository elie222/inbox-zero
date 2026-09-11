"use client";

import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { updateMcpServerAccessAction } from "@/utils/actions/api-key";
import { getActionErrorMessage } from "@/utils/error";
import { redirectToSafeUrl } from "@/utils/redirect";

const client = createAuthClient({
  plugins: [oauthProviderClient()],
  disableDefaultFetchPlugins: true,
});

export function McpConsent({
  clientName,
  clientId,
  scopes,
  enabled,
  restrictedSession,
}: {
  clientName: string;
  clientId: string;
  scopes: string[];
  enabled: boolean;
  restrictedSession: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const { executeAsync } = useAction(updateMcpServerAccessAction);

  async function respond(accept: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      if (accept && !enabled) {
        const result = await executeAsync({ enabled: true });
        if (!result?.data) throw new Error(getActionErrorMessage(result));
      }
      const result = await client.oauth2.consent({ accept });
      if (result.error)
        throw new Error(
          result.error.message || "Could not save your decision.",
        );
      redirectToSafeUrl(result.data.url, { allowExternal: true });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not authorize this application.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Connect {clientName}?</CardTitle>
          <CardDescription>
            This application is requesting access to Inbox Zero.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="break-all text-xs text-muted-foreground">
            Client ID: {clientId}
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {scopes.includes("mcp:read") && (
              <li>
                View your linked inboxes, automation rules, and email
                statistics.
              </li>
            )}
            {scopes.includes("mcp:write") && (
              <li>Create, replace, and delete automation rules.</li>
            )}
            {scopes.includes("offline_access") && (
              <li>
                Stay connected until you revoke access or your login session
                expires.
              </li>
            )}
          </ul>
          <p className="text-sm">
            These permissions apply to all your linked inboxes, including
            inboxes you link later. Only allow applications you trust.
          </p>
          <p className="text-sm text-muted-foreground">
            You can disconnect all MCP applications by turning off MCP in
            Settings → Developer.
          </p>
          {restrictedSession && (
            <p role="alert" className="text-sm text-destructive">
              Sign in with your connected provider to authorize applications.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={busy || restrictedSession}
              onClick={() => respond(false)}
            >
              Deny
            </Button>
            <Button
              disabled={busy || restrictedSession}
              onClick={() => respond(true)}
            >
              {enabled ? "Allow access" : "Enable MCP and allow"}
            </Button>
          </div>
          <Link href="/settings" className="text-sm underline">
            Back to settings
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
