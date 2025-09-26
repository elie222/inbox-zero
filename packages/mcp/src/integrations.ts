import type { McpIntegrationConfig } from "./types";

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
    description: "Read and write to your Notion workspace via MCP",
    serverUrl: "https://mcp.notion.com/",
    authType: "oauth",
    defaultScopes: [],
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
