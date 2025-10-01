/**
 * Authentication types supported by MCP servers
 */
export type AuthType = "oauth" | "api-token" | "basic";

/**
 * OAuth 2.1 configuration for an MCP integration
 */
export type OAuthConfig = {
  /** OAuth authorization endpoint URL */
  authorization_endpoint: string;
  /** OAuth token endpoint URL */
  token_endpoint: string;
  /** Optional: Dynamic Client Registration endpoint (RFC7591) */
  registration_endpoint?: string;
};

/**
 * Configuration for an MCP integration
 */
export type McpIntegrationConfig = {
  /** Unique identifier for the integration */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** MCP server URL */
  serverUrl?: string;
  /** Optional: NPM package name for local MCP servers */
  npmPackage?: string;
  /** Authentication type */
  authType: AuthType;
  /** OAuth scopes */
  scopes: string[];
  /** OAuth configuration (required if authType is 'oauth') */
  oauthConfig?: OAuthConfig;
  /** Optional: List of allowed tool names */
  allowedTools?: string[];
  /** Optional: Mark integration as coming soon */
  comingSoon?: boolean;
};

/**
 * OAuth token response
 */
export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

/**
 * OAuth client credentials (static or dynamically registered)
 */
export type ClientCredentials = {
  clientId: string;
  clientSecret?: string;
  isDynamic: boolean;
};

/**
 * Connection credentials stored per user
 */
export type ConnectionCredentials = {
  accessToken?: string | null;
  refreshToken?: string | null;
  apiKey?: string | null;
  expiresAt?: Date | null;
};

/**
 * Storage interface for credential management
 * Implement this to integrate with your database/storage system
 */
export interface CredentialStorage {
  /**
   * Get client credentials for an integration (shared across users)
   * @param integration - Integration name
   * @returns Client credentials or null if not found
   */
  getClientCredentials(integration: string): Promise<ClientCredentials | null>;

  /**
   * Store client credentials for an integration (shared across users)
   * @param integration - Integration name
   * @param credentials - Client credentials to store
   */
  storeClientCredentials(
    integration: string,
    credentials: ClientCredentials,
  ): Promise<void>;

  /**
   * Get connection credentials for a specific user
   * @param integration - Integration name
   * @param userId - User identifier
   * @returns Connection credentials or null if not found
   */
  getConnectionCredentials(
    integration: string,
    userId: string,
  ): Promise<ConnectionCredentials | null>;

  /**
   * Store connection credentials for a specific user
   * @param integration - Integration name
   * @param userId - User identifier
   * @param credentials - Connection credentials to store
   */
  storeConnectionCredentials(
    integration: string,
    userId: string,
    credentials: ConnectionCredentials,
  ): Promise<void>;

  /**
   * Update connection credentials (typically for token refresh)
   * @param integration - Integration name
   * @param userId - User identifier
   * @param credentials - Partial credentials to update
   */
  updateConnectionCredentials(
    integration: string,
    userId: string,
    credentials: Partial<ConnectionCredentials>,
  ): Promise<void>;
}

/**
 * Logger interface
 * All methods are optional - provide only what your logger supports
 * Common patterns: { trace, debug, info, warn, error } or { log, error }
 */
export interface Logger {
  trace?(message: string, meta?: Record<string, unknown>): void;
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
  log?(message: string, meta?: Record<string, unknown>): void;
}
