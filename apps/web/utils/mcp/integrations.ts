import {
  ATTIO_INTEGRATION,
  INTERCOM_INTEGRATION,
  LINEAR_INTEGRATION,
  MONDAY_INTEGRATION,
  NOTION_INTEGRATION,
  PIPEDREAM_INTEGRATION,
  STRIPE_INTEGRATION,
  TODOIST_INTEGRATION,
  type McpIntegration,
} from "./integrations-data";

export const MCP_INTEGRATIONS: Record<string, McpIntegration> = {
  notion: NOTION_INTEGRATION,
  stripe: STRIPE_INTEGRATION,
  linear: LINEAR_INTEGRATION,
  attio: ATTIO_INTEGRATION,
  intercom: INTERCOM_INTEGRATION,
  monday: MONDAY_INTEGRATION,
  todoist: TODOIST_INTEGRATION,
  pipedream: PIPEDREAM_INTEGRATION,
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
