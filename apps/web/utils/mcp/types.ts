type AuthType = "oauth" | "api-token" | "basic";

type OAuthConfig = {
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
  allowedTools?: string[];
};

// export type CredentialBundle = {
//   accessToken?: string | null;
//   refreshToken?: string | null;
//   apiKey?: string | null;
//   expiresAt?: Date | null;
// };
