import { getOrchestratorForEmailAccount } from "@/utils/mcp/orchestrator";
import prisma from "@/utils/prisma";
import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Collect MCP context for a given email by calling a small set of approved tools.
// For v1, we try a few common tools if present (e.g., hubspot:get_contact, notion:search_pages)
export async function collectMcpContext({
  emailAccountId,
  senderEmail,
  subject,
}: {
  emailAccountId: string;
  senderEmail: string | null | undefined;
  subject: string | null | undefined;
}): Promise<string | null> {
  const orchestrator = await getOrchestratorForEmailAccount(emailAccountId);
  const connections = await prisma.mcpConnection.findMany({
    where: { emailAccountId, isActive: true },
    include: { integration: true },
  });

  const aggregated: string[] = [];

  // First try AI SDK MCP client for HTTP servers
  for (const c of connections) {
    if (!c.integration.serverUrl) continue;
    try {
      const transport = new StreamableHTTPClientTransport(
        new URL(c.integration.serverUrl),
        {
          headers: {
            ...(c.accessToken
              ? { Authorization: `Bearer ${c.accessToken}` }
              : {}),
            ...(c.apiKey ? { "x-api-key": c.apiKey } : {}),
          },
        },
      );

      const client = await experimental_createMCPClient({ transport });
      const tools = await client.tools();
      const toolNames = Object.keys(tools);

      if (senderEmail) {
        const contactToolName = toolNames.find((n) => /contact/i.test(n));
        if (contactToolName) {
          try {
            const res = await tools[contactToolName]({ email: senderEmail });
            aggregated.push(
              `${c.integration.name} ${contactToolName}: ${JSON.stringify(res).slice(0, 2000)}`,
            );
          } catch {}
        }
      }

      if (subject) {
        const searchToolName = toolNames.find((n) => /search/i.test(n));
        if (searchToolName) {
          try {
            const res = await tools[searchToolName]({ query: subject });
            aggregated.push(
              `${c.integration.name} ${searchToolName}: ${JSON.stringify(res).slice(0, 2000)}`,
            );
          } catch {}
        }
      }

      await client.close();
    } catch {
      // Ignore AI SDK errors; we'll fall back to orchestrator below
    }
  }

  // Fallback via orchestrator simple HTTP-based calls
  if (aggregated.length === 0) {
    const tools = await orchestrator.listTools();
    const calls: Array<Promise<string | null>> = [];

    if (senderEmail) {
      const hubspotGetContact = tools.find(
        (t) =>
          t.name === "hubspot:get_contact" ||
          t.name === "hubspot:get_contact_details",
      );
      if (hubspotGetContact) {
        calls.push(
          orchestrator
            .callTool(hubspotGetContact.name, { email: senderEmail })
            .then((r) =>
              r.ok && r.result
                ? `HubSpot Contact: ${JSON.stringify(r.result).slice(0, 2000)}`
                : null,
            )
            .catch(() => null),
        );
      }
    }

    if (subject) {
      const notionSearch = tools.find(
        (t) => t.name === "notion:search" || t.name === "notion:search_pages",
      );
      if (notionSearch) {
        calls.push(
          orchestrator
            .callTool(notionSearch.name, { query: subject })
            .then((r) =>
              r.ok && r.result
                ? `Notion Search: ${JSON.stringify(r.result).slice(0, 2000)}`
                : null,
            )
            .catch(() => null),
        );
      }
    }

    if (calls.length) {
      const results = await Promise.all(calls);
      for (const r of results) if (r) aggregated.push(r);
    }
  }

  return aggregated.length ? aggregated.join("\n\n") : null;
}
