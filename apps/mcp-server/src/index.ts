import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Configuration
const API_BASE = process.env.API_BASE || "http://localhost:3000/api/v1";
const API_KEY = process.env.API_KEY || "";

if (!API_KEY) {
  console.error(
    "Error: API_KEY environment variable is not set. API requests will fail.",
  );
  process.exit(1);
}

// Create server instance
const server = new McpServer({
  name: "inbox-zero-ai",
  version: "0.0.1",
});

async function makeIZRequest<T>(url: string): Promise<T | null> {
  const headers = {
    "API-Key": API_KEY,
    "Content-Type": "application/json",
  };

  console.log(`Making request to ${url}`);

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `HTTP error! status: ${response.status}, response: ${errorText}`,
      );
      throw new Error(
        `HTTP error! status: ${response.status}, response: ${errorText}`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making Inbox Zero API request:", error);
    return null;
  }
}

// Define types based on the validation schemas
type ReplyTrackerResponse = {
  emails: Array<{
    threadId: string;
    subject: string;
    from: string;
    date: string;
    snippet: string;
  }>;
  count: number;
};

// Helper functions for formatting email data
function formatReplyTrackerEmail(email: ReplyTrackerResponse["emails"][0]) {
  return `- From: ${email.from}\n  Subject: ${email.subject}\n  Date: ${email.date}\n  Snippet: ${email.snippet}`;
}

// Helper function to create a formatted response
function createTextResponse(text: string) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

// Register tools
server.tool(
  "get-emails-needing-reply",
  "Get emails needing reply",
  {
    olderThan: z
      .enum(["3d", "1w", "2w", "1m"])
      .describe("Time range to look back"),
  },
  async ({ olderThan }) => {
    const url = `${API_BASE}/reply-tracker?type=needs-reply&timeRange=${olderThan}`;
    const data = await makeIZRequest<ReplyTrackerResponse>(url);

    if (!data) {
      return createTextResponse("Failed to fetch emails needing reply.");
    }

    const emailList = data.emails.map(formatReplyTrackerEmail).join("\n\n");
    return createTextResponse(
      `Found ${data.count} emails needing reply:\n\n${emailList}`,
    );
  },
);

server.tool(
  "get-emails-needing-follow-up",
  "Get emails needing follow-up",
  {
    olderThan: z
      .enum(["3d", "1w", "2w", "1m"])
      .describe("Time range to look back"),
  },
  async ({ olderThan }) => {
    const url = `${API_BASE}/reply-tracker?type=needs-follow-up&timeRange=${olderThan}`;
    const data = await makeIZRequest<ReplyTrackerResponse>(url);

    if (!data) {
      return createTextResponse(
        `Failed to fetch emails needing follow-up older than ${olderThan} days.`,
      );
    }

    const emailList = data.emails.map(formatReplyTrackerEmail).join("\n\n");
    return createTextResponse(
      `Found ${data.count} emails needing follow-up:\n\n${emailList}`,
    );
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Inbox Zero MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
