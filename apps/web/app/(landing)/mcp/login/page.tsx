import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isMcpServerAvailable } from "@/utils/mcp/config";
import { buildLoginRedirectUrl, buildRedirectUrl } from "@/utils/redirect";

export default async function McpLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The MCP flag can be enabled at runtime after a build with it disabled.
  await connection();
  if (!isMcpServerAvailable()) notFound();
  const params = await searchParams;
  // Resume authorization after any supported login flow without forcing a second login.
  const prompt =
    typeof params.prompt === "string"
      ? params.prompt
          .split(" ")
          .filter((value) => value !== "login")
          .join(" ")
      : undefined;
  redirect(
    buildLoginRedirectUrl(
      buildRedirectUrl("/api/auth/oauth2/authorize", {
        ...params,
        prompt: prompt || undefined,
      }),
    ),
  );
}
