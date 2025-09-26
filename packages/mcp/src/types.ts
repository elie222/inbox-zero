export type AuthType = "oauth" | "api-token" | "basic";

export type OAuthConfig = {
  authUrl: string;
  tokenUrl: string;
  userLevel?: boolean;
};

export type McpIntegrationConfig = {
  name: string;
  displayName: string;
  description?: string;
  serverUrl?: string;
  npmPackage?: string;
  authType: AuthType;
  defaultScopes: string[];
  oauthConfig?: OAuthConfig;
};

export type McpToolInfo = {
  name: string;
  title?: string;
  description?: string;
  schema?: unknown;
};

export type ToolListResponse = {
  tools: McpToolInfo[];
};

export type ToolCallParams = {
  name: string;
  arguments?: Record<string, unknown>;
};

export type ToolCallResult = {
  ok: boolean;
  result?: unknown;
  error?: { code?: string; message: string };
};

export interface McpClient {
  listTools(): Promise<McpToolInfo[]>;
  callTool(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<ToolCallResult>;
}

export type CredentialBundle = {
  accessToken?: string | null;
  refreshToken?: string | null;
  apiKey?: string | null;
  expiresAt?: Date | null;
};
