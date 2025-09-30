/**
 * @inboxzero/mcp - OAuth utilities for MCP (Model Context Protocol) integrations
 *
 * This package provides OAuth 2.1 with PKCE and dynamic client registration (RFC7591)
 * utilities for connecting to MCP servers. Use the official @modelcontextprotocol/sdk
 * for the actual MCP client.
 *
 * Key features:
 * - OAuth 2.1 with PKCE support
 * - Dynamic Client Registration (RFC7591) - no need for pre-registered OAuth clients
 * - Token refresh handling
 * - Helper utilities for setting up MCP transports
 * - Framework-agnostic with dependency injection for storage and logging
 *
 * @example
 * ```typescript
 * import { Client } from '@modelcontextprotocol/sdk/client/index.js';
 * import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
 * import {
 *   generateAuthorizationUrl,
 *   exchangeCodeForTokens,
 *   createMcpHeaders
 * } from '@inboxzero/mcp';
 *
 * // 1. OAuth Flow - Generate authorization URL
 * const { url, codeVerifier } = await generateAuthorizationUrl(
 *   integrationConfig,
 *   redirectUri,
 *   state,
 *   storage,
 *   logger
 * );
 * // Redirect user to `url`, store `codeVerifier` in session
 *
 * // 2. Exchange code for tokens (after user authorizes)
 * const tokens = await exchangeCodeForTokens(
 *   integrationConfig,
 *   code,
 *   codeVerifier,
 *   redirectUri,
 *   storage,
 *   logger
 * );
 * // Store tokens using your storage implementation
 *
 * // 3. Use the official MCP SDK with our helper for headers
 * const headers = await createMcpHeaders(
 *   integrationConfig,
 *   userId,
 *   storage,
 *   logger
 * );
 *
 * const transport = new StreamableHTTPClientTransport(
 *   new URL(integrationConfig.serverUrl),
 *   { requestInit: { headers } }
 * );
 *
 * const client = new Client({
 *   name: 'my-mcp-client',
 *   version: '1.0.0'
 * });
 *
 * await client.connect(transport);
 * const tools = await client.listTools();
 * const result = await client.callTool({ name: 'search', arguments: { query: 'test' } });
 * await client.close();
 * ```
 */
// biome-ignore-all lint/performance/noBarrelFile: Package entry point

export type {
  AuthType,
  OAuthConfig,
  McpIntegrationConfig,
  TokenResponse,
  ClientCredentials,
  ConnectionCredentials,
  CredentialStorage,
  Logger,
} from "./types";

// PKCE utilities
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEPair,
  verifyPKCEChallenge,
} from "./pkce";

// OAuth utilities
export {
  performDynamicClientRegistration,
  getOrCreateClientCredentials,
  generateAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
} from "./oauth";

// Helper utilities for MCP setup
export { getBearerToken, createMcpHeaders } from "./helpers";
