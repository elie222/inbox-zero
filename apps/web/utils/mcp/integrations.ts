import type { IntegrationProviderId } from "@/utils/mcp/providers/types";

type McpIntegrationConfig = {
  name: string;
  serverUrl?: string;
  // Hosted by a provider instead of a direct MCP server; `app` is the
  // provider's identifier for it
  provider?: { id: IntegrationProviderId; app: string };
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
    description: string; // Plain-English summary of the data this integration exposes, shown on the integrations page
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
    description: "Docs, wikis, and project notes",
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
    description: "Customers, subscriptions, invoices, and payments",
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
    description: "Issues, projects, and status",
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
    description: "CRM records, contacts, notes, and meetings",
    url: "attio.com",
    serverUrl: "https://mcp.attio.com/mcp",
    authType: "oauth",
    // offline_access is required for a refresh token; without it the
    // connection dies when the access token expires
    scopes: ["openid", "offline_access", "mcp"],
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
    description: "Support conversations, contacts, and help articles",
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
    description: "Boards, items, and workspaces",
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
    description: "Tasks and projects",
    url: "todoist.com",
    serverUrl: "https://ai.todoist.net/mcp",
    authType: "oauth",
    scopes: [],
    allowedTools: [],
    ruleActionWriteTools: ["add-tasks"],
  },
  hubspot: {
    name: "hubspot",
    displayName: "HubSpot",
    description: "Contacts, companies, deals, and tickets",
    url: "hubspot.com",
    provider: { id: "composio", app: "hubspot" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "HUBSPOT_SEARCH_CONTACTS_BY_CRITERIA",
      "HUBSPOT_SEARCH_COMPANIES",
      "HUBSPOT_SEARCH_DEALS",
      "HUBSPOT_SEARCH_TICKETS",
      "HUBSPOT_READ_CONTACT",
      "HUBSPOT_GET_COMPANY",
      "HUBSPOT_GET_DEAL",
      "HUBSPOT_GET_TICKET",
    ],
  },
  salesforce: {
    name: "salesforce",
    displayName: "Salesforce",
    description: "Accounts, contacts, leads, and opportunities",
    url: "salesforce.com",
    provider: { id: "composio", app: "salesforce" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "SALESFORCE_SEARCH_CONTACTS",
      "SALESFORCE_SEARCH_ACCOUNTS",
      "SALESFORCE_SEARCH_LEADS",
      "SALESFORCE_SEARCH_OPPORTUNITIES",
      "SALESFORCE_GET_CONTACT",
      "SALESFORCE_GET_ACCOUNT",
      "SALESFORCE_GET_OPPORTUNITY",
    ],
  },
  airtable: {
    name: "airtable",
    displayName: "Airtable",
    description: "Bases, tables, and records",
    url: "airtable.com",
    provider: { id: "composio", app: "airtable" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "AIRTABLE_LIST_BASES",
      "AIRTABLE_GET_BASE_SCHEMA",
      "AIRTABLE_LIST_RECORDS",
      "AIRTABLE_GET_RECORD",
    ],
  },
  googlesheets: {
    name: "googlesheets",
    displayName: "Google Sheets",
    description: "Spreadsheets and rows",
    url: "sheets.google.com",
    provider: { id: "composio", app: "googlesheets" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "GOOGLESHEETS_SEARCH_SPREADSHEETS",
      "GOOGLESHEETS_GET_SPREADSHEET_INFO",
      "GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW",
      "GOOGLESHEETS_BATCH_GET",
    ],
  },
  slack: {
    name: "slack",
    displayName: "Slack",
    description: "Messages, channels, and people",
    url: "slack.com",
    provider: { id: "composio", app: "slack" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "SLACK_SEARCH_MESSAGES",
      "SLACK_FETCH_MESSAGE_THREAD_FROM_A_CONVERSATION",
      "SLACK_FIND_USER_BY_EMAIL_ADDRESS",
      "SLACK_FIND_CHANNELS",
    ],
  },
  asana: {
    name: "asana",
    displayName: "Asana",
    description: "Tasks and projects",
    url: "asana.com",
    provider: { id: "composio", app: "asana" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "ASANA_SEARCH_TASKS_IN_WORKSPACE",
      "ASANA_GET_MULTIPLE_WORKSPACES",
      "ASANA_GET_A_TASK",
      "ASANA_GET_TASKS_FROM_A_PROJECT",
    ],
  },
  clickup: {
    name: "clickup",
    displayName: "ClickUp",
    description: "Tasks and comments",
    url: "clickup.com",
    provider: { id: "composio", app: "clickup" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "CLICKUP_GET_FILTERED_TEAM_TASKS",
      "CLICKUP_GET_TASK",
      "CLICKUP_GET_TASK_COMMENTS",
    ],
  },
  jira: {
    name: "jira",
    displayName: "Jira",
    description: "Issues, projects, and comments",
    url: "atlassian.com",
    provider: { id: "composio", app: "jira" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "JIRA_SEARCH_ISSUES",
      "JIRA_GET_ISSUE",
      "JIRA_LIST_ISSUE_COMMENTS",
      "JIRA_GET_ALL_PROJECTS",
    ],
  },
  zendesk: {
    name: "zendesk",
    displayName: "Zendesk",
    description: "Tickets, users, and organizations",
    url: "zendesk.com",
    provider: { id: "composio", app: "zendesk" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "ZENDESK_SEARCH_ZENDESK",
      "ZENDESK_SEARCH_ZENDESK_USERS",
      "ZENDESK_GET_USERS_REQUESTED_TICKETS",
      "ZENDESK_GET_ZENDESK_TICKET_BY_ID",
      "ZENDESK_GET_TICKET_COMMENTS",
      "ZENDESK_GET_ZENDESK_ORGANIZATION",
    ],
  },
  quickbooks: {
    name: "quickbooks",
    displayName: "QuickBooks",
    description: "Customers, invoices, and balances",
    url: "quickbooks.intuit.com",
    provider: { id: "composio", app: "quickbooks" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "QUICKBOOKS_QUERY_CUSTOMERS",
      "QUICKBOOKS_READ_CUSTOMER",
      "QUICKBOOKS_QUERY_INVOICES",
      "QUICKBOOKS_CUSTOMER_BALANCE_REPORT",
    ],
  },
  calendly: {
    name: "calendly",
    displayName: "Calendly",
    description: "Scheduled events and invitees",
    url: "calendly.com",
    provider: { id: "composio", app: "calendly" },
    authType: "oauth",
    scopes: [],
    allowedTools: [
      "CALENDLY_LIST_SCHEDULED_EVENTS",
      "CALENDLY_GET_EVENT",
      "CALENDLY_LIST_EVENT_INVITEES",
      "CALENDLY_GET_EVENT_INVITEE",
    ],
  },
  pipedream: {
    name: "pipedream",
    displayName: "HubSpot, Slack, Airtable, Todoist, and more (via Pipedream)",
    shortName: "Pipedream",
    description: "Hundreds more apps",
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
