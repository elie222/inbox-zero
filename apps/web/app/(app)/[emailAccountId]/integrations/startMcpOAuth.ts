import type { GetMcpAuthUrlResponse } from "@/app/api/mcp/[integration]/auth-url/route";
import { fetchWithAccount } from "@/utils/fetch";
import { redirectToSafeUrl } from "@/utils/redirect";

export async function startMcpOAuth({
  integrationName,
  emailAccountId,
}: {
  integrationName: string;
  emailAccountId: string;
}) {
  const response = await fetchWithAccount({
    url: `/api/mcp/${integrationName}/auth-url`,
    emailAccountId,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : undefined);
  }

  const data: GetMcpAuthUrlResponse = await response.json();
  redirectToSafeUrl(data.url, { allowExternal: true });
}
