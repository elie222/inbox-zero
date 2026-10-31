"use client";

import { useState } from "react";
import { createAuthClient } from "better-auth/react";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { useAction } from "next-safe-action/hooks";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [selected, setSelected] = useState(() =>
    scopes.filter((scope) => scope !== "mcp:send"),
  );
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
      const result = await client.oauth2.consent({
        accept,
        ...(accept && { scope: selected.join(" ") }),
      });
      if (result.error)
        throw new Error(
          result.error.message || "Could not save your decision.",
        );
      redirectToSafeUrl(result.data.url, {
        allowExternal: true,
        allowNativeOAuthRedirect: true,
      });
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
          <fieldset className="space-y-4" disabled={busy}>
            {scopes.map((scope) => (
              <label
                key={scope}
                htmlFor={`permission-${scope}`}
                className="flex items-start gap-3 text-sm"
              >
                <Checkbox
                  id={`permission-${scope}`}
                  checked={selected.includes(scope)}
                  disabled={scope === "mcp:read"}
                  onCheckedChange={(checked) =>
                    setSelected((current) =>
                      checked
                        ? [...current, scope]
                        : current.filter((value) => value !== scope),
                    )
                  }
                  aria-label={permissionLabel(scope)}
                />
                <span>{permissionLabel(scope)}</span>
              </label>
            ))}
          </fieldset>
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
            <Button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={() => respond(true)}
            >
              Allow
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function permissionLabel(scope: string) {
  switch (scope) {
    case "mcp:read":
      return "Read and search mail (required)";
    case "mcp:write":
      return "Create drafts, organize mail, and manage rules";
    case "mcp:send":
      return "Send email";
    case "offline_access":
      return "Stay connected when you are away";
    default:
      return scope;
  }
}
