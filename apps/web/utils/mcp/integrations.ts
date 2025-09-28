import type { McpIntegrationConfig } from "@/utils/mcp/types";

export const MCP_INTEGRATIONS: Record<string, McpIntegrationConfig> = {
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
    },
  },
  stripe: {
    name: "stripe",
    displayName: "Stripe",
    description: "Read and search your Stripe data via MCP",
    serverUrl: "https://mcp.stripe.com",
    authType: "oauth",
    defaultScopes: ["read"],
    allowedTools: [
      // "list_customers",
      // "list_disputes",
      // "list_invoices",
      // "list_payment_intents",
      // "list_prices",
      // "list_products",
      // "list_subscriptions",
      "search_stripe_resources",
    ],
    oauthConfig: {
      authUrl: "https://mcp.stripe.com/authorize",
      tokenUrl: "https://mcp.stripe.com/token",
    },
  },
  // monday: {
  //   name: "monday",
  //   displayName: "Monday.com",
  //   description: "Create and manage Monday.com boards and items",
  //   npmPackage: "@mondaydotcomorg/monday-api-mcp",
  //   authType: "api-token",
  //   defaultScopes: [],
  // },
  // hubspot: {
  //   name: "hubspot",
  //   displayName: "HubSpot CRM",
  //   description: "Access HubSpot CRM data for contacts, deals, and companies",
  //   serverUrl: "https://mcp.hubspot.com/",
  //   authType: "oauth",
  //   defaultScopes: [
  //     "crm.objects.contacts.read",
  //     "crm.objects.companies.read",
  //     "crm.objects.deals.read",
  //   ],
  //   oauthConfig: {
  //     authUrl: "https://app.hubspot.com/oauth/authorize",
  //     tokenUrl: "https://api.hubapi.com/oauth/v1/token",
  //   },
  // },
};

export type IntegrationKey = keyof typeof MCP_INTEGRATIONS;
