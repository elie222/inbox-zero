import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Provider } from "./config";

describe("createCliLanguageModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("@/env");
    vi.doUnmock("ai-sdk-provider-codex-cli");
    vi.doUnmock("ai-sdk-provider-claude-code");
    vi.doUnmock("ai-sdk-provider-grok-build");
  });

  it("loads the Codex provider lazily once and forwards calls", async () => {
    const doGenerate = vi.fn().mockResolvedValue({ text: "generated" });
    const doStream = vi.fn().mockResolvedValue({ stream: "chunk" });
    const codexExec = vi.fn(() => ({
      doGenerate,
      doStream,
    }));

    const { createCliLanguageModel } = await loadCliProviderModule({
      envOverrides: {
        CODEX_CLI_ALLOW_NPX: true,
        CODEX_CLI_PATH: "/usr/local/bin/codex",
      },
      codexModule: { codexExec },
    });

    const model = createCliLanguageModel({
      provider: Provider.CODEX_CLI,
      modelName: "gpt-5.3-codex",
    }) as any;

    await expect(model.doGenerate("generate-request")).resolves.toEqual({
      text: "generated",
    });
    await expect(model.doStream("stream-request")).resolves.toEqual({
      stream: "chunk",
    });

    expect(codexExec).toHaveBeenCalledTimes(1);
    expect(codexExec).toHaveBeenCalledWith("gpt-5.3-codex", {
      allowNpx: true,
      skipGitRepoCheck: true,
      approvalMode: "never",
      sandboxMode: "read-only",
      codexPath: "/usr/local/bin/codex",
      logger: false,
    });
    expect(doGenerate).toHaveBeenCalledWith("generate-request");
    expect(doStream).toHaveBeenCalledWith("stream-request");
  });

  it("passes Claude Code sandbox settings through to the provider package", async () => {
    const doStream = vi.fn().mockResolvedValue({ stream: "chunk" });
    const claudeCode = vi.fn(() => ({
      doGenerate: vi.fn(),
      doStream,
    }));

    const { createCliLanguageModel } = await loadCliProviderModule({
      claudeModule: { claudeCode },
    });

    const model = createCliLanguageModel({
      provider: Provider.CLAUDE_CODE,
      modelName: "sonnet",
    }) as any;

    await expect(model.doStream("stream-request")).resolves.toEqual({
      stream: "chunk",
    });

    expect(claudeCode).toHaveBeenCalledTimes(1);
    expect(claudeCode).toHaveBeenCalledWith("sonnet", {
      settingSources: [],
      allowedTools: [],
      permissionMode: "default",
      sandbox: { enabled: true },
    });
  });

  it("bridges AI SDK tools to Claude Code through MCP", async () => {
    const doGenerate = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool-call",
          toolName: "mcp__inboxzero__searchInbox",
          input: { query: "hello" },
        },
      ],
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({
          type: "tool-call",
          toolName: "mcp__inboxzero__createRule",
          input: { label: "later" },
        });
        controller.close();
      },
    });
    const doStream = vi.fn().mockResolvedValue({ stream });
    const innerModel = {
      specificationVersion: "v3",
      provider: "claude-code",
      modelId: "sonnet",
      supportedUrls: {},
      doGenerate,
      doStream,
    };
    const claudeCode = vi.fn(() => innerModel);
    const mcpServer = { type: "mcp-server" };
    const createAiSdkMcpServer = vi.fn(() => mcpServer);
    const searchInbox = {
      description: "Search inbox",
      inputSchema: {},
      execute: vi.fn(),
    };
    const createRule = {
      description: "Create rule",
      inputSchema: {},
      execute: vi.fn(),
    };

    const { createClaudeCodeLanguageModelWithBridgedTools } =
      await loadCliProviderModule({
        claudeModule: { claudeCode, createAiSdkMcpServer },
      });

    const model = (await createClaudeCodeLanguageModelWithBridgedTools({
      modelName: "sonnet",
      tools: { searchInbox, createRule },
    })) as any;

    await expect(model.doGenerate("generate-request")).resolves.toEqual({
      content: [
        {
          type: "tool-call",
          toolName: "searchInbox",
          input: { query: "hello" },
        },
      ],
    });
    const streamResult = await model.doStream("stream-request");
    const reader = streamResult.stream.getReader();
    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: {
        type: "tool-call",
        toolName: "createRule",
        input: { label: "later" },
      },
    });

    expect(createAiSdkMcpServer).toHaveBeenCalledWith("inboxzero", {
      searchInbox,
      createRule,
    });
    expect(claudeCode).toHaveBeenCalledWith("sonnet", {
      settingSources: [],
      allowedTools: [
        "mcp__inboxzero__searchInbox",
        "mcp__inboxzero__createRule",
      ],
      mcpServers: { inboxzero: mcpServer },
      permissionMode: "default",
      sandbox: { enabled: true },
    });
    expect(doGenerate).toHaveBeenCalledWith("generate-request");
    expect(doStream).toHaveBeenCalledWith("stream-request");
  });

  it("loads the Grok provider with isolated HOME and Inbox Zero tool clamp", async () => {
    const grok = makeGrokConstructors();

    const { createCliLanguageModel } = await loadCliProviderModule({
      envOverrides: { GROK_CLI_PATH: "/usr/local/bin/grok" },
      grokModule: grok.module,
    });

    const model = createCliLanguageModel({
      provider: Provider.GROK_CLI,
      modelName: "default",
    }) as any;

    await model.doGenerate("generate-request");

    expect(grok.modelOptions[0].id).toBe("default");
    expect(grok.modelOptions[0].settings).toMatchObject({
      authMethod: "cached_token",
      executablePath: "/usr/local/bin/grok",
    });
    expect(String(grok.acpOptions[0].cwd)).toContain(
      `${os.tmpdir()}${path.sep}inbox-zero-grok-`,
    );
    expect(String(grok.acpOptions[0].env.HOME)).toContain(`${path.sep}home`);
    expect(grok.acpOptions[0].env.GROK_AUTH_PATH).toBe(
      path.join(os.homedir(), ".grok", "auth.json"),
    );
    expect(grok.sessions[0]._meta.agentProfile.tools).toEqual([
      "search_tool",
      "use_tool",
    ]);
    expect(fs.existsSync(path.dirname(grok.acpOptions[0].cwd))).toBe(false);
  });

  it("approves only search_tool and use_tool by structured ACP identity", async () => {
    const grok = makeGrokConstructors();
    const { createCliLanguageModel } = await loadCliProviderModule({
      grokModule: grok.module,
    });
    const model = createCliLanguageModel({
      provider: Provider.GROK_CLI,
      modelName: "default",
    }) as any;
    await model.doGenerate("generate-request");

    const handler = grok.acpOptions[0].onPermissionRequest as (request: {
      options: Array<{ kind: string; optionId: string }>;
      toolCall?: unknown;
    }) => { outcome: { outcome: string; optionId?: string } };
    const options = [
      { optionId: "reject", kind: "reject_once" },
      { optionId: "allow", kind: "allow_once" },
    ];

    expect(
      handler({
        options,
        toolCall: { _meta: { "x.ai/tool": { name: "use_tool" } } },
      }),
    ).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
    expect(
      handler({
        options,
        toolCall: { _meta: { "x.ai/tool": { name: "search_tool" } } },
      }),
    ).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
    expect(
      handler({
        options,
        toolCall: { _meta: { "x.ai/tool": { name: "run_terminal_command" } } },
      }),
    ).toEqual({ outcome: { outcome: "cancelled" } });
    expect(
      handler({
        options,
        toolCall: {
          title: "Read inboxzero notes",
          rawInput: { path: "/tmp/inboxzero.md" },
          _meta: { "x.ai/tool": { name: "read_file" } },
        },
      }),
    ).toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("bridges AI SDK tools to Grok through a request-scoped loopback MCP endpoint", async () => {
    const doGenerate = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "inboxzero__searchInbox",
          input: JSON.stringify({ query: "hello" }),
        },
      ],
    });
    const grok = makeGrokConstructors({ doGenerate });
    const execute = vi.fn().mockResolvedValue({ emails: [] });

    const { createGrokCliLanguageModelWithBridgedTools } =
      await loadCliProviderModule({ grokModule: grok.module });

    const model = (await createGrokCliLanguageModelWithBridgedTools({
      modelName: "default",
      tools: {
        searchInbox: {
          description: "Search inbox",
          inputSchema: z.object({ query: z.string() }),
          execute,
        },
      },
    })) as any;

    const settings = grok.modelOptions[0].settings as {
      mcpServers: Array<{
        type: string;
        name: string;
        url: string;
        headers: Array<{ name: string; value: string }>;
      }>;
    };
    const mcpServer = settings.mcpServers[0];
    expect(mcpServer.type).toBe("http");
    expect(mcpServer.name).toBe("inboxzero");
    expect(mcpServer.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

    const unauthorized = await fetch(mcpServer.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(unauthorized.status).toBe(401);

    const callMcp = async (body: Record<string, unknown>) => {
      const response = await fetch(mcpServer.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: mcpServer.headers[0].value,
        },
        body: JSON.stringify({ jsonrpc: "2.0", ...body }),
      });
      return response.json();
    };

    await callMcp({
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    const listed = await callMcp({ id: 2, method: "tools/list", params: {} });
    expect(listed.result.tools[0]).toMatchObject({
      name: "searchInbox",
      description: "Search inbox",
    });
    const called = await callMcp({
      id: 3,
      method: "tools/call",
      params: { name: "searchInbox", arguments: { query: "unread" } },
    });
    expect(execute).toHaveBeenCalledWith(
      { query: "unread" },
      expect.objectContaining({ toolCallId: expect.any(String) }),
    );
    expect(called.result.content).toEqual([
      { type: "text", text: JSON.stringify({ emails: [] }) },
    ]);

    const generated = await model.doGenerate("generate-request");
    expect(generated.content[0].toolName).toBe("searchInbox");
    expect(generated.content[0].input).toBe(JSON.stringify({ query: "hello" }));

    await expect(fetch(mcpServer.url, { method: "POST" })).rejects.toThrow();
  });

  it("strips the inboxzero MCP prefix from provider-normalized stream parts", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({
          type: "tool-input-start",
          id: "call_1",
          toolName: "inboxzero__createRule",
        });
        controller.enqueue({
          type: "tool-input-delta",
          id: "call_1",
          delta: '{"label":"later"}',
        });
        controller.enqueue({
          type: "tool-call",
          toolCallId: "call_1",
          toolName: "inboxzero__createRule",
          input: JSON.stringify({ label: "later" }),
        });
        controller.close();
      },
    });
    const grok = makeGrokConstructors({
      doStream: vi.fn().mockResolvedValue({ stream }),
    });

    const { createGrokCliLanguageModelWithBridgedTools } =
      await loadCliProviderModule({ grokModule: grok.module });
    const model = (await createGrokCliLanguageModelWithBridgedTools({
      modelName: "default",
      tools: {
        createRule: {
          description: "Create rule",
          inputSchema: {},
          execute: vi.fn(),
        },
      },
    })) as any;

    const result = await model.doStream("stream-request");
    const reader = result.stream.getReader();
    const parts: any[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }

    expect(parts[0].toolName).toBe("createRule");
    expect(parts[1].delta).toBe(JSON.stringify({ label: "later" }));
    expect(parts[2].toolName).toBe("createRule");
    expect(parts[2].input).toBe(JSON.stringify({ label: "later" }));
  });

  it("surfaces a clear error when the provider package is missing its factory export", async () => {
    const { createCliLanguageModel } = await loadCliProviderModule({
      codexModule: { codexExec: undefined },
    });

    const model = createCliLanguageModel({
      provider: Provider.CODEX_CLI,
      modelName: "gpt-5.3-codex",
    }) as any;

    await expect(model.doGenerate("generate-request")).rejects.toThrow(
      'CLI LLM provider "codex-cli" package does not export "codexExec". Check the installed package version.',
    );
  });

  it("surfaces a clear error when the loaded model is missing a required method", async () => {
    const codexExec = vi.fn(() => ({
      doGenerate: vi.fn(),
    }));

    const { createCliLanguageModel } = await loadCliProviderModule({
      codexModule: { codexExec },
    });

    const model = createCliLanguageModel({
      provider: Provider.CODEX_CLI,
      modelName: "gpt-5.3-codex",
    }) as any;

    await expect(model.doStream("stream-request")).rejects.toThrow(
      'CLI LLM provider "codex-cli" returned a model without doStream. Check the installed package version.',
    );
  });
});

async function loadCliProviderModule({
  envOverrides,
  codexModule,
  claudeModule,
  grokModule,
}: {
  envOverrides?: Partial<{
    CLI_LLM_ENABLED: boolean;
    CODEX_CLI_ALLOW_NPX: boolean;
    CODEX_CLI_PATH: string | undefined;
    GROK_CLI_PATH: string | undefined;
  }>;
  codexModule?: Record<string, unknown>;
  claudeModule?: Record<string, unknown>;
  grokModule?: Record<string, unknown>;
} = {}) {
  vi.doMock("@/env", () => ({
    env: {
      CLI_LLM_ENABLED: true,
      CODEX_CLI_ALLOW_NPX: false,
      CODEX_CLI_PATH: undefined,
      GROK_CLI_PATH: undefined,
      ...envOverrides,
    },
  }));

  if (codexModule) {
    vi.doMock("ai-sdk-provider-codex-cli", () => codexModule);
  }

  if (claudeModule) {
    vi.doMock("ai-sdk-provider-claude-code", () => claudeModule);
  }

  if (grokModule) {
    vi.doMock("ai-sdk-provider-grok-build", () => grokModule);
  }

  return import("./cli-provider");
}

function makeGrokConstructors(
  impl: {
    doGenerate?: (...args: unknown[]) => unknown;
    doStream?: (...args: unknown[]) => unknown;
  } = {},
) {
  const acpOptions: any[] = [];
  const sessions: any[] = [];
  const modelOptions: Array<{
    id: string;
    settings: Record<string, unknown>;
    clientFactory: (opts: unknown) => any;
  }> = [];

  function AcpClient(this: any, opts: Record<string, unknown>) {
    acpOptions.push(opts);
    this.newSession = async (params: unknown) => {
      sessions.push(params);
      return { sessionId: "s" };
    };
    this.dispose = vi.fn().mockResolvedValue(undefined);
  }

  function GrokBuildLanguageModel(
    this: any,
    options: {
      id: string;
      settings: Record<string, unknown>;
      clientFactory: (opts: unknown) => any;
    },
  ) {
    modelOptions.push(options);
    const run = async (
      fn: ((...args: unknown[]) => unknown) | undefined,
      fallback: unknown,
      args: unknown[],
    ) => {
      const client = options.clientFactory({});
      try {
        await client.newSession({ mcpServers: options.settings.mcpServers });
        return fn ? await fn(...args) : fallback;
      } finally {
        await client.dispose();
      }
    };
    this.specificationVersion = "v3";
    this.provider = "grok-build";
    this.modelId = options.id;
    this.supportedUrls = {};
    this.doGenerate = (...args: unknown[]) =>
      run(impl.doGenerate, { text: "generated" }, args);
    this.doStream = (...args: unknown[]) =>
      run(impl.doStream, { stream: emptyStream() }, args);
  }

  return {
    module: { GrokBuildLanguageModel, AcpClient },
    modelOptions,
    acpOptions,
    sessions,
  };
}

function emptyStream() {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}
