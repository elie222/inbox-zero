import type { McpIntegrationConfig } from "../src/types";

/**
 * Example MCP integration configurations with dynamic client registration
 */

export const EXAMPLE_INTEGRATIONS: Record<string, McpIntegrationConfig> = {
  notion: {
    name: "notion",
    displayName: "Notion",
    serverUrl: "https://mcp.notion.com/mcp",
    authType: "oauth",
    defaultScopes: ["read"],
    oauthConfig: {
      authorization_endpoint: "https://mcp.notion.com/authorize",
      token_endpoint: "https://mcp.notion.com/token",
      registration_endpoint: "https://mcp.notion.com/register",
    },
  },

  stripe: {
    name: "stripe",
    displayName: "Stripe",
    serverUrl: "https://mcp.stripe.com",
    authType: "oauth",
    defaultScopes: [],
    oauthConfig: {
      authorization_endpoint:
        "https://marketplace.stripe.com/oauth/v2/authorize",
      token_endpoint: "https://marketplace.stripe.com/oauth/v2/token",
      registration_endpoint:
        "https://marketplace.stripe.com/oauth/v2/register/tailorapp%2AAZfBZ6Q69QAAADJI%23EhcKFWFjY3RfMVJlaTA0QUo4QktoWGxzQw",
    },
  },

  monday: {
    name: "monday",
    displayName: "Monday.com",
    serverUrl: "https://mcp.monday.com",
    authType: "oauth",
    defaultScopes: ["read", "write"],
    oauthConfig: {
      authorization_endpoint: "https://mcp.monday.com/authorize",
      token_endpoint: "https://mcp.monday.com/token",
      registration_endpoint: "https://mcp.monday.com/register",
    },
  },

  hubspot: {
    name: "hubspot",
    displayName: "HubSpot",
    serverUrl: "https://mcp.hubspot.com/",
    authType: "oauth",
    defaultScopes: ["crm.objects.contacts.read", "crm.objects.companies.read"],
    oauthConfig: {
      authorization_endpoint: "https://mcp.hubspot.com/oauth/authorize/user",
      token_endpoint: "https://mcp.hubspot.com/oauth/v1/token",
      // Note: HubSpot may not support dynamic registration
    },
  },
};
