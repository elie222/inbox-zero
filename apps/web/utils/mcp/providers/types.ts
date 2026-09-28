// A provider hosts third-party app connections for us: it runs the app's OAuth,
// stores the tokens, and exposes the connected app as an MCP server. Swapping
// the provider behind an app only changes the app's registry entry.
export type IntegrationProvider = {
  isConfigured(): boolean;
  getConnectUrl(
    args: ProviderAppArgs & { callbackUrl: string },
  ): Promise<string>;
  // Called when the user returns from the provider; keeps only the newest
  // active connection so reconnecting replaces the old account
  completeConnection(args: ProviderAppArgs): Promise<boolean>;
  disconnect(args: ProviderAppArgs): Promise<void>;
  getMcpServer(
    args: ProviderAppArgs & { allowedTools: string[] },
  ): Promise<{ url: string; headers: Record<string, string> }>;
};

export type IntegrationProviderId = "composio";

type ProviderAppArgs = { app: string; emailAccountId: string };
