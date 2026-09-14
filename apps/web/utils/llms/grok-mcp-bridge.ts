import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { asSchema } from "ai";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("grok-mcp-bridge");

export type McpBridgedTool = {
  description?: string;
  inputSchema: unknown;
  execute?: (input: never, options?: unknown) => unknown;
};

export type GrokMcpBridge = {
  url: string;
  authorization: string;
  close: () => Promise<void>;
};

const MCP_PATH = "/mcp";

export async function startGrokMcpBridge(
  tools: Record<string, McpBridgedTool>,
): Promise<GrokMcpBridge> {
  const authorization = `Bearer ${randomBytes(32).toString("hex")}`;
  const preparedTools = prepareTools(tools);

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (req.headers.authorization !== authorization) {
        res.writeHead(401).end();
        return;
      }
      if (!req.url?.startsWith(MCP_PATH)) {
        res.writeHead(404).end();
        return;
      }
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const server = createMcpToolServer(preparedTools);
      res.on("close", () => {
        transport.close().catch(() => {});
        server.close().catch(() => {});
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      logger.error("Grok MCP bridge request failed", { error });
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  httpServer.unref();

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Grok MCP bridge failed to bind a loopback port");
  }

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeAllConnections();
    });
  };

  return {
    url: `http://127.0.0.1:${address.port}${MCP_PATH}`,
    authorization,
    close,
  };
}

type PreparedTool = {
  description?: string;
  execute?: McpBridgedTool["execute"];
  schema: () => ReturnType<typeof asSchema>;
};

function prepareTools(
  tools: Record<string, McpBridgedTool>,
): Map<string, PreparedTool> {
  return new Map(
    Object.entries(tools).map(([name, tool]) => {
      let cached: ReturnType<typeof asSchema> | undefined;
      return [
        name,
        {
          description: tool.description,
          execute: tool.execute,
          schema: () => {
            cached ??= asSchema(
              tool.inputSchema as Parameters<typeof asSchema>[0],
            );
            return cached;
          },
        },
      ];
    }),
  );
}

function createMcpToolServer(preparedTools: Map<string, PreparedTool>): Server {
  const server = new Server(
    { name: "inbox-zero", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [...preparedTools.entries()].map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.schema().jsonSchema as { type: "object" },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const tool = preparedTools.get(name);
    if (!tool?.execute) {
      return toolError(`Unknown tool: ${name}`);
    }
    try {
      const args = request.params.arguments ?? {};
      const validated = await tool.schema().validate?.(args);
      if (validated && !validated.success) {
        return toolError(`Invalid input for ${name}: ${validated.error}`);
      }
      const input = validated?.success ? validated.value : args;
      const result = await tool.execute(input as never, {
        toolCallId: `grok-mcp-${randomUUID()}`,
        messages: [],
      });
      return {
        content: [
          {
            type: "text" as const,
            text:
              typeof result === "string"
                ? result
                : JSON.stringify(result ?? null),
          },
        ],
      };
    } catch (error) {
      logger.error("Bridged tool execution failed", { toolName: name, error });
      return toolError(
        error instanceof Error ? error.message : "Tool execution failed",
      );
    }
  });

  return server;
}

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
