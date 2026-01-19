type McpIntegrationConfig = {
  name: string;
  serverUrl?: string;
  authType: "oauth" | "api-token";
  scopes: string[];
  skipResourceParam?: boolean; // Some OAuth servers don't support RFC 8707 resource parameter
  defaultToolsDisabled?: boolean; // For integrations with many tools (e.g. Pipedream), disable by default
  toolsWarning?: string; // Warning message to show when user expands tools list
  filterWriteTools?: boolean; // Auto-filter write tools, only sync read-only tools (get, list, find, search)
};

export const MCP_INTEGRATIONS: Record<
  string,
  McpIntegrationConfig & {
    displayName: string;
    shortName?: string; // Short name for display in compact contexts (e.g. "Connected to X")
    allowedTools?: string[];
    comingSoon?: boolean;
    oauthConfig?: {
      authorization_endpoint: string;
      token_endpoint: string;
      registration_endpoint?: string;
    };
  }
> = {
  notion: {
    name: "notion",
    displayName: "Notion",
    serverUrl: "https://mcp.notion.com/mcp",
    authType: "oauth",
    scopes: ["read"],
    allowedTools: ["notion-search", "notion-fetch"],
    // OAuth endpoints auto-discovered via RFC 8414/9728
  },
  stripe: {
    name: "stripe",
    displayName: "Stripe",
    serverUrl: "https://mcp.stripe.com",
    authType: "oauth", // must request whitelisting of /api/mcp/stripe/callback from Stripe. localhost is whitelisted already.
    // authType: "api-token", // alternatively, use an API token.
    scopes: [],
    allowedTools: [
      "list_customers",
      "list_disputes",
      "list_invoices",
      "list_payment_intents",
      "list_prices",
      "list_products",
      "list_subscriptions",
      // "search_stripe_resources",
    ],
    // OAuth endpoints auto-discovered via RFC 8414/9728
  },
  monday: {
    name: "monday",
    displayName: "Monday.com",
    serverUrl: "https://mcp.monday.com/mcp",
    authType: "oauth",
    scopes: ["read", "write"],
    allowedTools: [
      "get_board_items_by_name",
      // "create_item",
      // "create_update",
      // "get_board_activity",
      "get_board_info",
      // "list_users_and_teams",
      // "create_board",
      // "create_form",
      // "update_form",
      // "get_form",
      // "form_questions_editor",
      // "create_column",
      // "create_group",
      // "all_monday_api",
      // "get_graphql_schema",
      // "get_column_type_info",
      // "get_type_details",
      // "read_docs",
      "workspace_info",
      "list_workspaces",
      // "create_doc",
      // "update_workspace",
      // "update_folder",
      // "create_workspace",
      // "create_folder",
      // "move_object",
      // "create_dashboard",
      // "all_widgets_schema",
      // "create_widget",
    ],
    // OAuth endpoints auto-discovered via RFC 8414
    comingSoon: false,
  },
  pipedream: {
    name: "pipedream",
    displayName: "HubSpot, Slack, Airtable, Todoist, and more (via Pipedream)",
    shortName: "Pipedream",
    serverUrl: "https://mcp.pipedream.net/v2",
    authType: "oauth",
    scopes: ["mcp", "offline_access"],
    skipResourceParam: true, // Pipedream doesn't support RFC 8707 resource parameter
    defaultToolsDisabled: true, // Pipedream can have 100s of tools, let users enable what they need
    filterWriteTools: true, // Only sync read-only tools (get, list, find, search)
    toolsWarning:
      "Only enable read-only tools. These tools are used during email drafting, so reading data is safe. Avoid enabling tools that create, update, or delete data.",
    // No allowedTools - accept all tools Pipedream provides
    // OAuth endpoints auto-discovered via RFC 8414
  },
  // hubspot: {
  //   name: "hubspot",
  //   displayName: "HubSpot",
  //   serverUrl: "https://mcp.hubspot.com/",
  //   authType: "oauth",
  //   scopes: [
  //     "content",
  //     "crm.objects.companies.read",
  //     "crm.objects.companies.write",
  //     "crm.objects.contacts.read",
  //     "crm.objects.contacts.write",
  //     "crm.objects.deals.write",
  //     "forms",
  //     "oauth",
  //     "timeline",
  //   ],
  //   oauthConfig: {
  //     authorization_endpoint: "https://app.hubspot.com/oauth/authorize",
  //     token_endpoint: "https://mcp.hubspot.com/oauth/v1/token",
  //   },
  //   comingSoon: true,
  // },
};

export type IntegrationKey = keyof typeof MCP_INTEGRATIONS;

export function getIntegration(
  name: string,
): (typeof MCP_INTEGRATIONS)[IntegrationKey] {
  const integration = MCP_INTEGRATIONS[name];
  if (!integration) {
    throw new Error(`Unknown MCP integration: ${name}`);
  }
  return integration;
}

export function getStaticCredentials(
  integration: IntegrationKey,
): { clientId?: string; clientSecret?: string } | undefined {
  switch (integration) {
    // case "hubspot":
    //   return {
    //     clientId: env.HUBSPOT_MCP_CLIENT_ID,
    //     clientSecret: env.HUBSPOT_MCP_CLIENT_SECRET,
    //   };
    default:
      return undefined;
  }
}
