type McpIntegrationConfig = {
  name: string;
  serverUrl?: string;
  authType: "oauth" | "api-token";
  scopes: string[];
  skipResourceParam?: boolean; // Some OAuth servers don't support RFC 8707 resource parameter
  filterWriteTools?: boolean; // Require read-only annotations and names; new tools start disabled
  ruleActionWriteTools?: string[];
};

export const MCP_INTEGRATIONS: Record<
  string,
  McpIntegrationConfig & {
    displayName: string;
    shortName?: string; // Short name for display in compact contexts (e.g. "Connected to X")
    url: string; // Domain URL for favicon display
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
    url: "notion.com",
    serverUrl: "https://mcp.notion.com/mcp",
    authType: "oauth",
    scopes: ["read"],
    allowedTools: ["notion-search", "notion-fetch"],
    // OAuth endpoints auto-discovered via RFC 8414/9728
  },
  stripe: {
    name: "stripe",
    displayName: "Stripe",
    url: "stripe.com",
    serverUrl: "https://mcp.stripe.com",
    authType: "oauth", // must request whitelisting of /api/mcp/stripe/callback from Stripe. localhost is whitelisted already.
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
  linear: {
    name: "linear",
    displayName: "Linear",
    url: "linear.app",
    // Dedicated read-only endpoint; the server only exposes read tools here
    serverUrl: "https://mcp.linear.app/mcp/readonly",
    authType: "oauth",
    scopes: ["read"],
    // OAuth endpoints auto-discovered via RFC 8414/9728
  },
  attio: {
    name: "attio",
    displayName: "Attio",
    url: "attio.com",
    serverUrl: "https://mcp.attio.com/mcp",
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "search-records",
      "list-records",
      "get-records-by-ids",
      "list-attribute-definitions",
      "list-lists",
      "list-list-attribute-definitions",
      "list-records-in-list",
      "search-notes-by-metadata",
      "semantic-search-notes",
      "get-note-body",
      "list-tasks",
      "search-meetings",
      // Write tools intentionally excluded: create-record, upsert-record,
      // update-record, merge-records, add-record-to-list, create-note, ...
    ],
    // OAuth endpoints auto-discovered via RFC 8414/9728
  },
  intercom: {
    name: "intercom",
    displayName: "Intercom",
    url: "intercom.com",
    // US-hosted workspaces only; EU workspaces use mcp.eu.intercom.com (not supported yet)
    serverUrl: "https://mcp.intercom.com/mcp",
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "search",
      "fetch",
      "search_conversations",
      "get_conversation",
      "search_contacts",
      "get_contact",
      "list_companies",
      "get_company",
      "list_articles",
      "search_articles",
      "get_article",
      // Write tools intentionally excluded: create_article, update_article
    ],
    // OAuth endpoints auto-discovered via RFC 8414/9728
  },
  monday: {
    name: "monday",
    displayName: "Monday.com",
    url: "monday.com",
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
  },
  todoist: {
    name: "todoist",
    displayName: "Todoist",
    url: "todoist.com",
    serverUrl: "https://ai.todoist.net/mcp",
    authType: "oauth",
    scopes: [],
    allowedTools: [],
    ruleActionWriteTools: ["add-tasks"],
  },
  pipedream: {
    name: "pipedream",
    displayName: "HubSpot, Slack, Airtable, Todoist, and more (via Pipedream)",
    shortName: "Pipedream",
    url: "pipedream.com",
    serverUrl: "https://mcp.pipedream.net/v2",
    authType: "oauth",
    scopes: ["mcp", "offline_access"],
    skipResourceParam: true, // Pipedream doesn't support RFC 8707 resource parameter
    filterWriteTools: true,
    // No fixed allowlist because Pipedream's catalog is dynamic
    // OAuth endpoints auto-discovered via RFC 8414
  },
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

// For untrusted names (URL params, stored connection names). getIntegration throws instead.
export function findIntegration(
  name: string,
): (typeof MCP_INTEGRATIONS)[IntegrationKey] | undefined {
  return Object.hasOwn(MCP_INTEGRATIONS, name)
    ? MCP_INTEGRATIONS[name]
    : undefined;
}
