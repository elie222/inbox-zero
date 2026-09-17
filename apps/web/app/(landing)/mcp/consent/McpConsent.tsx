"use client";

import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateMcpServerAccessAction } from "@/utils/actions/api-key";
import { getActionErrorMessage } from "@/utils/error";
import { redirectToSafeUrl } from "@/utils/redirect";

const client = createAuthClient({
  plugins: [oauthProviderClient()],
  disableDefaultFetchPlugins: true,
});

export function McpConsent({
  clientName,
  scopes,
  enabled,
}: {
  clientName: string;
  scopes: string[];
  enabled: boolean;
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
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Connect {clientName}?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {consentSummary(scopes)}
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => respond(false)}
            >
              Deny
            </Button>
            <Button type="button" disabled={busy} onClick={() => respond(true)}>
              Allow
            </Button>
          </div>
          <Link
            href="/settings"
            className="text-sm text-muted-foreground underline"
          >
            Settings
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

function consentSummary(scopes: string[]) {
  if (scopes.includes("mcp:write")) {
    return "Can search mail, create drafts, and manage rules. Can't send email.";
  }
  return "Can search and read mail. Can't send email.";
}
