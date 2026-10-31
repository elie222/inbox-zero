import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Generic "knowledge base" MCP emulator standing in for a user-registered
 * custom remote MCP server. Streamable HTTP, API key auth
 * (`Authorization: Bearer <apiKey>`, 401 otherwise). Pass `apiKey: null` for a
 * public server that accepts every request.
 *
 * `search-documents` and `get-document` are annotated read-only, so they start
 * enabled. `update-document` has no annotations, so it starts disabled.
 *
 * Binds 127.0.0.1: the SSRF guard blocks the `localhost` hostname even with
 * MCP_ALLOW_PRIVATE_IPS, so point the app at the IP literal in `url`.
 */

export type KnowledgeBaseDocument = { id: string; title: string; body: string };

export type KnowledgeBaseToolCall = {
  name: string;
  args: Record<string, unknown>;
  authorization: string | undefined;
};

export type KnowledgeBaseMcpEmulator = {
  url: string;
  toolCalls: KnowledgeBaseToolCall[];
  unauthorizedRequests: number;
  close: () => Promise<void>;
};

export const KNOWLEDGE_BASE_TOOL_NAMES = {
  search: "search-documents",
  get: "get-document",
  update: "update-document",
} as const;

const DEFAULT_API_KEY = "kb-test-key";

const DEFAULT_DOCUMENTS: KnowledgeBaseDocument[] = [
  {
    id: "doc-refunds",
    title: "Refund policy",
    body: "Annual plans can be refunded in full within 30 days of purchase.",
  },
  {
    id: "doc-onboarding",
    title: "Onboarding checklist",
    body: "New workspaces get a setup call and a shared project template.",
  },
];

export async function createKnowledgeBaseMcpEmulator({
  port = 0,
  apiKey = DEFAULT_API_KEY,
  documents = DEFAULT_DOCUMENTS,
}: {
  port?: number;
  apiKey?: string | null;
  documents?: KnowledgeBaseDocument[];
} = {}): Promise<KnowledgeBaseMcpEmulator> {
  const state = {
    apiKey,
    documents: documents.map((doc) => ({ ...doc })),
    toolCalls: [] as KnowledgeBaseToolCall[],
    unauthorizedRequests: 0,
  };

  const httpServer = http.createServer((req, res) => {
    handleRequest(req, res, state).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", resolve);
  });

  const address = httpServer.address();
  const boundPort =
    address && typeof address === "object" ? address.port : port;

  return {
    url: `http://127.0.0.1:${boundPort}/mcp`,
    toolCalls: state.toolCalls,
    get unauthorizedRequests() {
      return state.unauthorizedRequests;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.closeAllConnections();
        httpServer.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

type EmulatorState = {
  apiKey: string | null;
  documents: KnowledgeBaseDocument[];
  toolCalls: KnowledgeBaseToolCall[];
  unauthorizedRequests: number;
};

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: EmulatorState,
) {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  if (
    state.apiKey !== null &&
    req.headers.authorization !== `Bearer ${state.apiKey}`
  ) {
    state.unauthorizedRequests += 1;
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "invalid_token" }));
    return;
  }

  if (req.method !== "POST") {
    // Stateless server: no SSE stream (GET) or session teardown (DELETE)
    res.writeHead(405, { Allow: "POST" });
    res.end();
    return;
  }

  const body = await readJsonBody(req);
  const server = createServer(state, req.headers.authorization);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

function createServer(state: EmulatorState, authorization: string | undefined) {
  const server = new Server(
    { name: "knowledge-base-mcp-emulator", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: KNOWLEDGE_BASE_TOOL_NAMES.search,
        description: "Search knowledge base documents by keyword",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: KNOWLEDGE_BASE_TOOL_NAMES.get,
        description: "Get the full text of a knowledge base document",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: KNOWLEDGE_BASE_TOOL_NAMES.update,
        description: "Replace the text of a knowledge base document",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, body: { type: "string" } },
          required: ["id", "body"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const args = request.params.arguments ?? {};
    state.toolCalls.push({ name: request.params.name, args, authorization });

    switch (request.params.name) {
      case KNOWLEDGE_BASE_TOOL_NAMES.search: {
        const query = String(args.query ?? "").toLowerCase();
        const results = state.documents
          .filter((doc) =>
            `${doc.title} ${doc.body}`.toLowerCase().includes(query),
          )
          .map(({ id, title }) => ({ id, title }));
        return textResult({ results });
      }
      case KNOWLEDGE_BASE_TOOL_NAMES.get: {
        const doc = state.documents.find((item) => item.id === args.id);
        if (!doc) return errorResult(`Document not found: ${args.id}`);
        return textResult(doc);
      }
      case KNOWLEDGE_BASE_TOOL_NAMES.update: {
        const doc = state.documents.find((item) => item.id === args.id);
        if (!doc) return errorResult(`Document not found: ${args.id}`);
        doc.body = String(args.body ?? "");
        return textResult(doc);
      }
      default:
        return errorResult(`Unknown tool: ${request.params.name}`);
    }
  });

  return server;
}

function textResult(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function errorResult(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return;
  try {
    return JSON.parse(raw);
  } catch {
    return;
  }
}
