import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
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
      restrictedSession={session.session.emailOtp === true}
    />
  );
}
