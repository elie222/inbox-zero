import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      specificationVersion: "v4",
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

    const { createCliLanguageModelWithTools } = await loadCliProviderModule({
      claudeModule: { claudeCode, createAiSdkMcpServer },
    });

    const model = (await createCliLanguageModelWithTools({
      provider: Provider.CLAUDE_CODE,
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

  it("does not bridge tools for a CLI provider without a tool bridge", async () => {
    const codexModel = { doGenerate: vi.fn(), doStream: vi.fn() };
    const codexExec = vi.fn(() => codexModel);

    const { createCliLanguageModelWithTools, supportsCliToolBridge } =
      await loadCliProviderModule({ codexModule: { codexExec } });

    expect(supportsCliToolBridge(Provider.CODEX_CLI)).toBe(false);
    expect(supportsCliToolBridge(Provider.OPEN_AI)).toBe(false);
    await expect(
      createCliLanguageModelWithTools({
        provider: Provider.CODEX_CLI,
        modelName: "gpt-5.3-codex",
        tools: { searchInbox: { inputSchema: {}, execute: vi.fn() } },
      }),
    ).resolves.toBe(codexModel);
  });

  it("refuses to load a CLI provider when CLI_LLM_ENABLED is off", async () => {
    const codexExec = vi.fn();
    const { createCliLanguageModel } = await loadCliProviderModule({
      envOverrides: { CLI_LLM_ENABLED: false },
      codexModule: { codexExec },
    });

    expect(() =>
      createCliLanguageModel({
        provider: Provider.CODEX_CLI,
        modelName: "gpt-5.3-codex",
      }),
    ).toThrow('CLI LLM provider "codex-cli" is disabled.');
    expect(codexExec).not.toHaveBeenCalled();
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
}: {
  envOverrides?: Partial<{
    CLI_LLM_ENABLED: boolean;
    CODEX_CLI_ALLOW_NPX: boolean;
    CODEX_CLI_PATH: string | undefined;
  }>;
  codexModule?: Record<string, unknown>;
  claudeModule?: Record<string, unknown>;
} = {}) {
  vi.doMock("@/env", () => ({
    env: {
      CLI_LLM_ENABLED: true,
      CODEX_CLI_ALLOW_NPX: false,
      CODEX_CLI_PATH: undefined,
      ...envOverrides,
    },
  }));

  if (codexModule) {
    vi.doMock("ai-sdk-provider-codex-cli", () => codexModule);
  }

  if (claudeModule) {
    vi.doMock("ai-sdk-provider-claude-code", () => claudeModule);
  }

  return import("./cli-provider");
}
