import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { auth, betterAuthConfig } from "@/utils/auth";
import { getMcpServerAccess } from "@/utils/mcp/access";
import { isMcpServerAvailable, MCP_SCOPES } from "@/utils/mcp/config";
import { buildLoginRedirectUrl, buildRedirectUrl } from "@/utils/redirect";
import { McpConsent } from "@/app/(landing)/mcp/consent/McpConsent";

export default async function McpConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The MCP flag can be enabled at runtime after a build with it disabled.
  await connection();
  if (!isMcpServerAvailable()) notFound();
  const params = await searchParams;
  const session = await auth();
  if (!session?.user)
    redirect(buildLoginRedirectUrl(buildRedirectUrl("/mcp/consent", params)));
  if (
    typeof params.client_id !== "string" ||
    typeof params.scope !== "string" ||
    typeof params.sig !== "string"
  )
    notFound();
  const scopes = params.scope.split(" ").filter(Boolean);
  if (scopes.some((scope) => !MCP_SCOPES.some((allowed) => allowed === scope)))
    notFound();
  // Email code sessions are rejected by every authorization endpoint, so this
  // page cannot load the client or record a decision for them.
  if (session.session.emailOtp === true)
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-12">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign in with your provider</CardTitle>
            <CardDescription>
              Applications cannot be authorized from an email code sign-in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm">
              Sign in with your connected provider, then start this connection
              again.
            </p>
            <Link href="/settings" className="text-sm underline">
              Back to settings
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  const requestHeaders = await headers();
  const [client, access] = await Promise.all([
    betterAuthConfig.api.getOAuthClientPublic({
      headers: requestHeaders,
      query: { client_id: params.client_id },
    }),
    getMcpServerAccess(session.user.id),
  ]);
  return (
    <McpConsent
      clientName={client.client_name || "MCP application"}
      clientId={params.client_id}
      scopes={scopes}
      enabled={access.enabled}
    />
  );
}
