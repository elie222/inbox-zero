import type { McpIntegrationConfig } from "@/utils/mcp/types";

export const MCP_INTEGRATIONS: Record<string, McpIntegrationConfig> = {
  hubspot: {
    name: "hubspot",
    displayName: "HubSpot CRM",
    description: "Access HubSpot CRM data for contacts, deals, and companies",
    serverUrl: "https://mcp.hubspot.com/",
    authType: "oauth",
    defaultScopes: [
      "crm.objects.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.deals.read",
    ],
    oauthConfig: {
      authUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      userLevel: true,
    },
  },
  notion: {
    name: "notion",
    displayName: "Notion",
    description: "Read and search your Notion workspace via MCP",
    serverUrl: "https://mcp.notion.com/mcp",
    authType: "oauth",
    defaultScopes: ["read"],
    allowedTools: ["notion-search", "notion-fetch"],
    oauthConfig: {
      authUrl: "https://mcp.notion.com/authorize",
      tokenUrl: "https://mcp.notion.com/token",
      userLevel: true,
    },
  },
  monday: {
    name: "monday",
    displayName: "Monday.com",
    description: "Create and manage Monday.com boards and items",
    npmPackage: "@mondaydotcomorg/monday-api-mcp",
    authType: "api-token",
    defaultScopes: [],
  },
};

export type IntegrationKey = keyof typeof MCP_INTEGRATIONS;
