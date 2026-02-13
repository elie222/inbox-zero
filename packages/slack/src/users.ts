import type { WebClient } from "@slack/web-api";

export async function lookupSlackUserByEmail(
  client: WebClient,
  email: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const response = await client.users.lookupByEmail({ email });
    if (!response.user?.id) return null;
    return { id: response.user.id, name: response.user.name ?? "" };
  } catch (error: unknown) {
    const slackError =
      error instanceof Error && "data" in error
        ? (error as Error & { data?: { error?: string } }).data?.error
        : undefined;
    if (slackError === "users_not_found" || slackError === "missing_scope") {
      return null;
    }
    throw error;
  }
}
