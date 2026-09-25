export const PIPEDREAM_APPS = [
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "Contacts, companies, and deals",
    url: "hubspot.com",
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    description: "Accounts, contacts, and opportunities",
    url: "salesforce.com",
  },
  {
    slug: "pipedrive",
    name: "Pipedrive",
    description: "Deals, people, and organizations",
    url: "pipedrive.com",
  },
  {
    slug: "zoho_crm",
    name: "Zoho CRM",
    description: "Leads, contacts, and deals",
    url: "zoho.com",
  },
  {
    slug: "airtable",
    name: "Airtable",
    description: "Bases, tables, and records",
    url: "airtable.com",
  },
  {
    slug: "google_sheets",
    name: "Google Sheets",
    description: "Spreadsheets and rows",
    url: "sheets.google.com",
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Channels, messages, and users",
    url: "slack.com",
  },
  {
    slug: "asana",
    name: "Asana",
    description: "Projects and tasks",
    url: "asana.com",
  },
  {
    slug: "clickup",
    name: "ClickUp",
    description: "Tasks, lists, and spaces",
    url: "clickup.com",
  },
  {
    slug: "jira",
    name: "Jira",
    description: "Issues and projects",
    url: "atlassian.com",
  },
  {
    slug: "zendesk",
    name: "Zendesk",
    description: "Support tickets and customers",
    url: "zendesk.com",
  },
  {
    slug: "shopify",
    name: "Shopify",
    description: "Orders, customers, and products",
    url: "shopify.com",
  },
  {
    slug: "quickbooks",
    name: "QuickBooks",
    description: "Customers, invoices, and payments",
    url: "quickbooks.intuit.com",
  },
  {
    slug: "calendly",
    name: "Calendly",
    description: "Scheduled events and invitees",
    url: "calendly.com",
  },
];

// Pipedream tool names start with the app slug, which can carry a variant
// suffix (e.g. "slack_v2-list-channels", "airtable_oauth-list-bases")
export function isPipedreamAppConnected(
  appSlug: string,
  toolNames: string[],
): boolean {
  return toolNames.some((toolName) => {
    const toolApp = toolName.toLowerCase().split("-")[0];
    return toolApp === appSlug || toolApp.startsWith(`${appSlug}_`);
  });
}
