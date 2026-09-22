/**
 * Integration test: user-registered custom MCP server (API key auth) against a
 * local knowledge base MCP emulator (__tests__/emulators/knowledge-base-mcp.ts).
 *
 * Runs the real server actions, tool sync, SSRF-guarded fetch, and the MCP
 * tool builder the research agent uses, over real streamable HTTP. Prisma is an
 * in-memory store of the MCP tables because CI runs integration tests without
 * Postgres; the Playwright spec covers the same flow against a real database.
 *
 * Usage:
 *   pnpm test-integration custom-mcp-server
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  createKnowledgeBaseMcpEmulator,
  KNOWLEDGE_BASE_TOOL_NAMES,
  type KnowledgeBaseMcpEmulator,
} from "@/__tests__/emulators/knowledge-base-mcp";
import { createTestLogger } from "@/__tests__/helpers";
import {
  createCustomMcpServerAction,
  removeCustomMcpServerAction,
} from "@/utils/actions/mcp";
import { createMcpToolsForAgent } from "@/utils/ai/mcp/mcp-tools";
import { resolveMcpIntegration } from "@/utils/mcp/resolve-integration";
import { syncMcpTools } from "@/utils/mcp/sync-tools";

const TEST_USER_ID = "kb-user-1";
const TEST_EMAIL = "kb-owner@example.com";
const TEST_ACCOUNT_ID = "kb-account-1";

const { envOverrides, db } = vi.hoisted(() => ({
  envOverrides: { MCP_ALLOW_PRIVATE_IPS: true } as Record<string, unknown>,
  db: {
    integrations: [] as Array<Record<string, any>>,
    connections: [] as Array<Record<string, any>>,
    tools: [] as Array<Record<string, any>>,
  },
}));

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    env: new Proxy(actual.env, {
      get: (target, key: string) =>
        key in envOverrides
          ? envOverrides[key]
          : (target as Record<string, unknown>)[key],
    }),
  };
});

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: TEST_USER_ID, email: TEST_EMAIL },
    session: {},
  })),
}));

vi.mock("@/utils/prisma", () => ({ default: createMcpPrismaStore(db) }));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Custom MCP server (knowledge base)",
  { timeout: 30_000 },
  () => {
    let emulator: KnowledgeBaseMcpEmulator;

    beforeAll(async () => {
      emulator = await createKnowledgeBaseMcpEmulator({
        apiKey: "kb-secret-key",
      });
    });

    afterAll(async () => {
      await emulator?.close();
    });

    beforeEach(() => {
      envOverrides.MCP_ALLOW_PRIVATE_IPS = true;
      db.integrations.length = 0;
      db.connections.length = 0;
      db.tools.length = 0;
      emulator.toolCalls.length = 0;
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    test("syncs tools with only read-only annotated tools enabled", async () => {
      const name = await addServer(emulator);

      const toolsByName = Object.fromEntries(
        db.tools.map((tool) => [tool.name, tool]),
      );
      expect(Object.keys(toolsByName).sort()).toEqual(
        Object.values(KNOWLEDGE_BASE_TOOL_NAMES).sort(),
      );
      expect(toolsByName[KNOWLEDGE_BASE_TOOL_NAMES.search]).toMatchObject({
        isEnabled: true,
        isWrite: false,
      });
      expect(toolsByName[KNOWLEDGE_BASE_TOOL_NAMES.get]).toMatchObject({
        isEnabled: true,
        isWrite: false,
      });
      expect(toolsByName[KNOWLEDGE_BASE_TOOL_NAMES.update]).toMatchObject({
        isEnabled: false,
        isWrite: false,
      });

      expect(
        await resolveMcpIntegration({ name, emailAccountId: TEST_ACCOUNT_ID }),
      ).toMatchObject({ isCustom: true, serverUrl: emulator.url });
    });

    test("research agent tools call the server with the stored API key", async () => {
      await addServer(emulator);

      const { tools, cleanup } = await createMcpToolsForAgent(TEST_ACCOUNT_ID);
      try {
        expect(Object.keys(tools).sort()).toEqual(
          [
            KNOWLEDGE_BASE_TOOL_NAMES.get,
            KNOWLEDGE_BASE_TOOL_NAMES.search,
          ].sort(),
        );

        const result = await executeTool(
          tools[KNOWLEDGE_BASE_TOOL_NAMES.search],
          { query: "refund" },
        );

        expect(JSON.parse(result.content[0].text)).toEqual({
          results: [{ id: "doc-refunds", title: "Refund policy" }],
        });
      } finally {
        await cleanup();
      }

      expect(emulator.toolCalls).toEqual([
        {
          name: KNOWLEDGE_BASE_TOOL_NAMES.search,
          args: { query: "refund" },
          authorization: "Bearer kb-secret-key",
        },
      ]);
    });

    test("a wrong API key is rejected and the server is not saved", async () => {
      const unauthorizedBefore = emulator.unauthorizedRequests;

      const result = await createCustomMcpServerAction(TEST_ACCOUNT_ID, {
        displayName: "Team knowledge base",
        serverUrl: emulator.url,
        authType: "api-token",
        apiKey: "wrong-key",
      });

      expect(result?.serverError).toBe(
        "Could not connect to the server. Check the URL and API key.",
      );
      expect(emulator.unauthorizedRequests).toBeGreaterThan(unauthorizedBefore);
      expect(db.integrations).toHaveLength(0);
      expect(db.connections).toHaveLength(0);
    });

    test("a removed server can no longer be resolved or called", async () => {
      const name = await addServer(emulator);

      const result = await removeCustomMcpServerAction(TEST_ACCOUNT_ID, {
        name,
      });
      expect(result?.serverError).toBeUndefined();

      expect(
        await resolveMcpIntegration({ name, emailAccountId: TEST_ACCOUNT_ID }),
      ).toBeUndefined();

      const { tools, cleanup } = await createMcpToolsForAgent(TEST_ACCOUNT_ID);
      await cleanup();
      expect(tools).toEqual({});

      await expect(
        syncMcpTools(name, TEST_ACCOUNT_ID, createTestLogger()),
      ).rejects.toThrow("Unknown integration");
      expect(emulator.toolCalls).toHaveLength(0);
    });

    test("refuses a localhost server when private IPs are not allowed", async () => {
      envOverrides.MCP_ALLOW_PRIVATE_IPS = false;

      const result = await createCustomMcpServerAction(TEST_ACCOUNT_ID, {
        displayName: "Team knowledge base",
        serverUrl: emulator.url,
        authType: "api-token",
        apiKey: emulator.apiKey,
      });

      expect(result?.serverError).toBe("The server URL must use https");
      expect(db.integrations).toHaveLength(0);
    });

    test("the fetch guard refuses a stored localhost server once private IPs are disallowed", async () => {
      const name = await addServer(emulator);
      envOverrides.MCP_ALLOW_PRIVATE_IPS = false;

      await expect(
        syncMcpTools(name, TEST_ACCOUNT_ID, createTestLogger()),
      ).rejects.toThrow("Custom MCP servers must use https");

      const { tools, cleanup } = await createMcpToolsForAgent(TEST_ACCOUNT_ID);
      await cleanup();
      expect(tools).toEqual({});
      expect(emulator.toolCalls).toHaveLength(0);
    });
  },
);

async function addServer(emulator: KnowledgeBaseMcpEmulator) {
  const result = await createCustomMcpServerAction(TEST_ACCOUNT_ID, {
    displayName: "Team knowledge base",
    serverUrl: emulator.url,
    authType: "api-token",
    apiKey: emulator.apiKey,
  });

  expect(result?.serverError).toBeUndefined();
  const name = result?.data?.name;
  if (!name) throw new Error("Custom server was not created");
  return name;
}

async function executeTool(tool: unknown, args: Record<string, unknown>) {
  const { execute } = tool as {
    execute: (
      input: Record<string, unknown>,
      options: { toolCallId: string; messages: [] },
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  };
  return execute(args, { toolCallId: "call-1", messages: [] });
}

// In-memory stand-in for the MCP tables, covering only the queries the custom
// server flow makes. Relation filters mirror the Prisma schema's cascades.
function createMcpPrismaStore(store: {
  integrations: Array<Record<string, any>>;
  connections: Array<Record<string, any>>;
  tools: Array<Record<string, any>>;
}) {
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${++nextId}`;

  const integrationById = (integrationId: string) =>
    store.integrations.find((row) => row.id === integrationId);

  const connectionMatches = (row: Record<string, any>, where: any) =>
    (where.emailAccountId === undefined ||
      row.emailAccountId === where.emailAccountId) &&
    (where.isActive === undefined || row.isActive === where.isActive) &&
    (where.integration?.name === undefined ||
      integrationById(row.integrationId)?.name === where.integration.name) &&
    (where.tools?.some === undefined ||
      toolsFor(row.id).some((tool) => toolMatches(tool, where.tools.some)));

  const toolMatches = (row: Record<string, any>, where: any = {}) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  const toolsFor = (connectionId: string, where?: any) =>
    store.tools.filter(
      (tool) => tool.connectionId === connectionId && toolMatches(tool, where),
    );

  const withRelations = (row: Record<string, any>, shape: any = {}) => ({
    ...row,
    integration: integrationById(row.integrationId),
    tools: toolsFor(row.id, shape.tools?.where),
  });

  const deleteIntegrations = (predicate: (row: any) => boolean) => {
    const removed = store.integrations.filter(predicate);
    for (const integration of removed) {
      const connectionIds = store.connections
        .filter((row) => row.integrationId === integration.id)
        .map((row) => row.id);
      removeWhere(store.tools, (tool) =>
        connectionIds.includes(tool.connectionId),
      );
      removeWhere(store.connections, (row) => connectionIds.includes(row.id));
      removeWhere(store.integrations, (row) => row.id === integration.id);
    }
    return removed.length;
  };

  return {
    emailAccount: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === TEST_ACCOUNT_ID
          ? {
              email: TEST_EMAIL,
              account: { userId: TEST_USER_ID, provider: "google" },
            }
          : null,
      ),
    },
    user: {
      findUnique: vi.fn(async () => ({
        premium: { tier: "PLUS_MONTHLY", stripeSubscriptionStatus: "active" },
      })),
    },
    mcpIntegration: {
      count: vi.fn(
        async ({ where }: any) =>
          store.integrations.filter(
            (row) => row.emailAccountId === where.emailAccountId,
          ).length,
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: id("integration"), ...data };
        store.integrations.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({ where }: any) =>
          store.integrations.find(
            (row) =>
              row.name === where.name &&
              row.emailAccountId === where.emailAccountId,
          ) ?? null,
      ),
      delete: vi.fn(async ({ where }: any) => {
        deleteIntegrations((row) => row.id === where.id);
      }),
      deleteMany: vi.fn(async ({ where }: any) => ({
        count: deleteIntegrations(
          (row) =>
            row.name === where.name &&
            row.emailAccountId === where.emailAccountId,
        ),
      })),
    },
    mcpConnection: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: id("connection"), ...data };
        store.connections.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where, include, select }: any) => {
        const row = store.connections.find((item) =>
          connectionMatches(item, where),
        );
        return row ? withRelations(row, include ?? select) : null;
      }),
      findMany: vi.fn(async ({ where, select }: any) =>
        store.connections
          .filter((item) => connectionMatches(item, where))
          .map((row) => withRelations(row, select)),
      ),
    },
    mcpTool: {
      deleteMany: vi.fn(async ({ where }: any) => {
        removeWhere(store.tools, (tool) => toolMatches(tool, where));
      }),
      createMany: vi.fn(async ({ data }: any) => {
        for (const tool of data) store.tools.push({ id: id("tool"), ...tool });
      }),
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  };
}

function removeWhere<T>(rows: T[], predicate: (row: T) => boolean) {
  for (let index = rows.length - 1; index >= 0; index--) {
    if (predicate(rows[index])) rows.splice(index, 1);
  }
}
