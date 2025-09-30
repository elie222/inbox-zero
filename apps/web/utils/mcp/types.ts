type AuthType = "oauth" | "api-token" | "basic";

type OAuthConfig = {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string; // For dynamic client registration (RFC7591)
};

export type McpIntegrationConfig = {
  name: string;
  displayName: string;
  serverUrl?: string;
  npmPackage?: string;
  authType: AuthType;
  defaultScopes: string[];
  oauthConfig?: OAuthConfig;
  allowedTools?: string[];
  comingSoon?: boolean;
};

// export type CredentialBundle = {
//   accessToken?: string | null;
//   refreshToken?: string | null;
//   apiKey?: string | null;
//   expiresAt?: Date | null;
// };
