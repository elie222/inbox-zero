import http from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Mini Todoist MCP emulator: a local streamable-HTTP MCP server mimicking
 * ai.todoist.net/mcp for the tools Inbox Zero uses (`add-tasks`,
 * `find-projects`). Auth is ignored. Point the app at it with
 * MCP_SERVER_URL_OVERRIDES={"todoist":"http://localhost:<port>/mcp"}.
 */

export type TodoistProject = { id: string; name: string };

export type TodoistMcpEmulator = {
  url: string;
  addedTasks: Array<Record<string, unknown>>;
  close: () => Promise<void>;
};

const DEFAULT_PROJECTS: TodoistProject[] = [
  { id: "inbox", name: "Inbox" },
  { id: "6X7rM8997g3RQmvh", name: "Work" },
  { id: "6X7rM8997g3RQmvj", name: "Personal" },
];

export async function createTodoistMcpEmulator({
  port,
  projects = DEFAULT_PROJECTS,
}: {
  port: number;
  projects?: TodoistProject[];
}): Promise<TodoistMcpEmulator> {
  const addedTasks: Array<Record<string, unknown>> = [];

  const httpServer = http.createServer((req, res) => {
    handleRequest(req, res, { projects, addedTasks }).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));

  return {
    url: `http://localhost:${port}/mcp`,
    addedTasks,
    close: () =>
      new Promise<void>((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  state: {
    projects: TodoistProject[];
    addedTasks: Array<Record<string, unknown>>;
  },
) {
  if (req.method !== "POST") {
    // Stateless server: no SSE stream (GET) or session teardown (DELETE)
    res.writeHead(405, { Allow: "POST" });
    res.end();
    return;
  }

  const body = await readJsonBody(req);
  const server = createServer(state);
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

function createServer(state: {
  projects: TodoistProject[];
  addedTasks: Array<Record<string, unknown>>;
}) {
  const server = new Server(
    { name: "todoist-mcp-emulator", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "add-tasks",
        description: "Add one or more tasks to Todoist",
        inputSchema: {
          type: "object",
          properties: {
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string" },
                  description: { type: "string" },
                  dueString: { type: "string" },
                  projectId: { type: "string" },
                },
                required: ["content"],
              },
            },
          },
          required: ["tasks"],
        },
      },
      {
        name: "find-projects",
        description: "List Todoist projects",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "find-tasks",
        description: "Search Todoist tasks",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, (request) => {
    switch (request.params.name) {
      case "add-tasks": {
        const tasks = Array.isArray(request.params.arguments?.tasks)
          ? (request.params.arguments.tasks as Array<Record<string, unknown>>)
          : [];
        const created = tasks.map((task, index) => ({
          id: `task_${state.addedTasks.length + index + 1}`,
          ...task,
        }));
        state.addedTasks.push(...created);
        return {
          content: [{ type: "text", text: JSON.stringify({ tasks: created }) }],
        };
      }
      case "find-projects":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ results: state.projects }),
            },
          ],
        };
      case "find-tasks":
        return {
          content: [{ type: "text", text: JSON.stringify({ results: [] }) }],
        };
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${request.params.name}`,
            },
          ],
          isError: true,
        };
    }
  });

  return server;
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
