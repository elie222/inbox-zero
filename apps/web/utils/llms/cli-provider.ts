import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import { Provider } from "@/utils/llms/config";
import {
  type GrokMcpBridge,
  type McpBridgedTool,
  startGrokMcpBridge,
} from "@/utils/llms/grok-mcp-bridge";

type CliProvider = string;

type CliProviderModule = Record<string, unknown>;

type CliModelFactory = (
  modelName: string,
  settings?: Record<string, unknown>,
) => LanguageModelV3;

type McpBridgeFactory = (
  name: string,
  tools: Record<string, McpBridgedTool>,
) => unknown;

const runtimeImport = (specifier: string): Promise<CliProviderModule> =>
  import(/* webpackIgnore: true */ specifier);

const CLAUDE_CODE_PACKAGE = "ai-sdk-provider-claude-code";
const CLAUDE_CODE_MCP_SERVER_NAME = "inboxzero";

export function assertCliLlmEnabled(provider: CliProvider) {
  if (env.CLI_LLM_ENABLED) return;

  throw new SafeError(
    `CLI LLM provider "${provider}" is disabled. Set CLI_LLM_ENABLED=true and install the matching community provider package to use it.`,
  );
}

export function createCliLanguageModel({
  provider,
  modelName,
}: {
  provider: CliProvider;
  modelName: string;
}): LanguageModelV3 {
  assertCliLlmEnabled(provider);

  let modelPromise: Promise<LanguageModelV3> | undefined;

  const getModel = () => {
    modelPromise ??= loadCliLanguageModel({ provider, modelName });
    return modelPromise;
  };

  return {
    specificationVersion: "v3",
    provider,
    modelId: modelName,
    supportedUrls: {},
    async doGenerate(...args: unknown[]) {
      const model = await getModel();
      const doGenerate = getModelMethod(model, "doGenerate", provider);
      return doGenerate(...args);
    },
    async doStream(...args: unknown[]) {
      const model = await getModel();
      const doStream = getModelMethod(model, "doStream", provider);
      return doStream(...args);
    },
  } as unknown as LanguageModelV3;
}

// AI SDK tools cannot be auto-bridged at the LanguageModelV3 layer: by the
// time the wrapper sees them they have been reduced to JSON schemas with no
// `execute`. Callers that pass tools must therefore use this helper, which
// wires the original tool record through `createAiSdkMcpServer` so the
// Claude Code CLI can invoke them locally over MCP.
export async function createClaudeCodeLanguageModelWithBridgedTools({
  modelName,
  tools,
}: {
  modelName: string;
  tools: Record<string, McpBridgedTool>;
}): Promise<LanguageModelV3> {
  assertCliLlmEnabled(Provider.CLAUDE_CODE);

  const module = await importOptionalProviderPackage(
    CLAUDE_CODE_PACKAGE,
    Provider.CLAUDE_CODE,
  );
  const claudeCode = getFactory(module, "claudeCode", Provider.CLAUDE_CODE);
  const createBridge = getFactory(
    module,
    "createAiSdkMcpServer",
    Provider.CLAUDE_CODE,
  ) as McpBridgeFactory;

  const toolNames = Object.keys(tools);
  if (toolNames.length === 0) return createClaudeCodeLanguageModel(modelName);

  const mcpServer = createBridge(CLAUDE_CODE_MCP_SERVER_NAME, tools);
  const allowedTools = toolNames.map((name) => prefixToolName(name));

  const inner = claudeCode(modelName, {
    settingSources: [],
    allowedTools,
    mcpServers: { [CLAUDE_CODE_MCP_SERVER_NAME]: mcpServer },
    permissionMode: "default",
    sandbox: { enabled: true },
  });

  return wrapWithUnprefixedToolNames(inner);
}

const TOOL_NAME_PREFIX = `mcp__${CLAUDE_CODE_MCP_SERVER_NAME}__`;

function prefixToolName(name: string): string {
  return `${TOOL_NAME_PREFIX}${name}`;
}

function unprefixToolName(name: string): string {
  return name.startsWith(TOOL_NAME_PREFIX)
    ? name.slice(TOOL_NAME_PREFIX.length)
    : name;
}

// The MCP bridge causes the Claude Code CLI to surface tool calls as
// `mcp__inboxzero__<name>`. Inbox Zero callers (stop conditions, UI part
// renderers, validators) match on the original tool names, so the prefix is
// stripped from every `toolName` field in both the non-streaming and
// streaming response paths before it reaches the AI SDK consumer.
function wrapWithUnprefixedToolNames(model: LanguageModelV3): LanguageModelV3 {
  const wrapped = {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    async doGenerate(...args: unknown[]) {
      const doGenerate = getModelMethod(
        model,
        "doGenerate",
        Provider.CLAUDE_CODE,
      );
      const result = (await doGenerate(...args)) as {
        content?: unknown[];
      } & Record<string, unknown>;
      return {
        ...result,
        ...(Array.isArray(result.content)
          ? { content: result.content.map(unprefixPart) }
          : {}),
      };
    },
    async doStream(...args: unknown[]) {
      const doStream = getModelMethod(model, "doStream", Provider.CLAUDE_CODE);
      const result = (await doStream(...args)) as {
        stream: ReadableStream<unknown>;
      } & Record<string, unknown>;
      const stream = result.stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(unprefixPart(chunk));
          },
        }),
      );
      return { ...result, stream };
    },
  };
  return wrapped as unknown as LanguageModelV3;
}

function unprefixPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return part;
  const record = part as Record<string, unknown>;
  if (typeof record.toolName !== "string") return part;
  return { ...record, toolName: unprefixToolName(record.toolName) };
}

async function loadCliLanguageModel({
  provider,
  modelName,
}: {
  provider: CliProvider;
  modelName: string;
}): Promise<LanguageModelV3> {
  switch (provider) {
    case Provider.CODEX_CLI:
      return createCodexCliLanguageModel(modelName);
    case Provider.CLAUDE_CODE:
      return createClaudeCodeLanguageModel(modelName);
    case Provider.GROK_CLI:
      return createGrokCliLanguageModel(modelName);
    default:
      throw new SafeError(`Unsupported CLI LLM provider: ${provider}`);
  }
}

async function createCodexCliLanguageModel(modelName: string) {
  const module = await importOptionalProviderPackage(
    "ai-sdk-provider-codex-cli",
    Provider.CODEX_CLI,
  );
  const codexExec = getFactory(module, "codexExec", Provider.CODEX_CLI);

  return codexExec(modelName, {
    allowNpx: env.CODEX_CLI_ALLOW_NPX,
    skipGitRepoCheck: true,
    approvalMode: "never",
    sandboxMode: "read-only",
    ...(env.CODEX_CLI_PATH ? { codexPath: env.CODEX_CLI_PATH } : {}),
    logger: false,
  });
}

async function createClaudeCodeLanguageModel(modelName: string) {
  const module = await importOptionalProviderPackage(
    CLAUDE_CODE_PACKAGE,
    Provider.CLAUDE_CODE,
  );
  const claudeCode = getFactory(module, "claudeCode", Provider.CLAUDE_CODE);

  return claudeCode(modelName, {
    settingSources: [],
    allowedTools: [],
    permissionMode: "default",
    sandbox: { enabled: true },
  });
}

async function createGrokCliLanguageModel(modelName: string) {
  return createRestrictedGrokModel(await loadGrokModule(), modelName);
}

const GROK_MCP_SERVER_NAME = "inboxzero";
const GROK_TOOL_NAME_PREFIX = `${GROK_MCP_SERVER_NAME}__`;
const ALLOWED_GROK_PERMISSION_TOOLS = new Set(["search_tool", "use_tool"]);

export async function createGrokCliLanguageModelWithBridgedTools({
  modelName,
  tools,
}: {
  modelName: string;
  tools: Record<string, McpBridgedTool>;
}): Promise<LanguageModelV3> {
  assertCliLlmEnabled(Provider.GROK_CLI);
  if (Object.keys(tools).length === 0) {
    return createGrokCliLanguageModel(modelName);
  }

  const module = await loadGrokModule();
  const bridge = await startGrokMcpBridge(tools);
  try {
    return wrapGrokModel({
      model: createRestrictedGrokModel(module, modelName, {
        mcpServers: [
          {
            type: "http",
            name: GROK_MCP_SERVER_NAME,
            url: bridge.url,
            headers: [{ name: "Authorization", value: bridge.authorization }],
          },
        ],
      }),
      bridge,
    });
  } catch (error) {
    await bridge.close();
    throw error;
  }
}

const GROK_AGENT_PROFILE = {
  name: "inboxzero",
  description: "Inbox Zero tools only",
  tools: ["search_tool", "use_tool"],
};

function createRestrictedGrokModel(
  module: CliProviderModule,
  modelName: string,
  extra: Record<string, unknown> = {},
): LanguageModelV3 {
  const GrokBuildLanguageModel = getGrokConstructor(
    module,
    "GrokBuildLanguageModel",
  );
  const AcpClient = getGrokConstructor(module, "AcpClient");
  return new GrokBuildLanguageModel({
    id: modelName,
    settings: grokCliSettings(extra),
    clientFactory: (options: Record<string, unknown>) =>
      createIsolatedGrokClient(AcpClient, options),
  }) as LanguageModelV3;
}

function createIsolatedGrokClient(
  AcpClient: new (
    options: Record<string, unknown>,
  ) => {
    newSession: (params: unknown, signal?: unknown) => Promise<unknown>;
    dispose?: (...args: unknown[]) => unknown;
  },
  options: Record<string, unknown>,
) {
  const workspace = createGrokWorkspace();
  try {
    writeGrokHomeConfig(workspace.home);
    const noProxy = withLoopbackNoProxy(
      process.env.NO_PROXY ?? process.env.no_proxy,
    );
    const client = new AcpClient({
      ...options,
      cwd: workspace.cwd,
      args: withInboxZeroGrokArgs(
        options.args as readonly string[] | undefined,
      ),
      env: {
        ...((options.env as Record<string, string | undefined> | undefined) ??
          {}),
        HOME: workspace.home,
        GROK_HOME: workspace.home,
        GROK_AUTH_PATH: copyGrokAuthIntoHome(workspace.home),
        GROK_SANDBOX: "strict",
        NO_PROXY: noProxy,
        no_proxy: noProxy,
      },
      fileSystem: { readTextFile: false, writeTextFile: false },
      onPermissionRequest: allowInboxZeroToolsOnly,
    });
    const newSession = client.newSession.bind(client);
    client.newSession = (params, signal) =>
      newSession(withInboxZeroSession(params, workspace.cwd), signal);
    const dispose = client.dispose?.bind(client);
    let removed = false;
    client.dispose = async (...args: unknown[]) => {
      try {
        return await dispose?.(...args);
      } finally {
        if (!removed) {
          removed = true;
          workspace.remove();
        }
      }
    };
    return client;
  } catch (error) {
    workspace.remove();
    throw error;
  }
}

function withInboxZeroSession(params: unknown, cwd: string) {
  const base =
    params && typeof params === "object"
      ? (params as Record<string, unknown>)
      : {};
  const meta =
    base._meta && typeof base._meta === "object"
      ? (base._meta as Record<string, unknown>)
      : {};
  return {
    ...base,
    cwd,
    _meta: { ...meta, agentProfile: GROK_AGENT_PROFILE },
  };
}

function allowInboxZeroToolsOnly(request: {
  options: Array<{ kind: string; optionId: string }>;
  toolCall?: unknown;
}) {
  const name = grokPermissionToolName(request.toolCall);
  if (!name || !ALLOWED_GROK_PERMISSION_TOOLS.has(name)) {
    return { outcome: { outcome: "cancelled" as const } };
  }
  const option =
    request.options.find((candidate) => candidate.kind === "allow_once") ??
    request.options.find((candidate) => candidate.kind === "allow_always");
  if (!option) return { outcome: { outcome: "cancelled" as const } };
  return {
    outcome: { outcome: "selected" as const, optionId: option.optionId },
  };
}

function grokPermissionToolName(toolCall: unknown): string | undefined {
  if (!toolCall || typeof toolCall !== "object") return;
  const record = toolCall as Record<string, unknown>;
  const meta = record._meta;
  if (meta && typeof meta === "object") {
    const tool = (meta as Record<string, unknown>)["x.ai/tool"];
    if (tool && typeof tool === "object") {
      const name = (tool as { name?: unknown }).name;
      if (typeof name === "string" && name.length > 0) return name;
    }
  }
  return typeof record.title === "string" &&
    ALLOWED_GROK_PERMISSION_TOOLS.has(record.title)
    ? record.title
    : undefined;
}

function createGrokWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "inbox-zero-grok-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "cwd");
  fs.mkdirSync(home, { recursive: true, mode: 0o700 });
  fs.mkdirSync(cwd, { recursive: true, mode: 0o700 });
  return {
    home,
    cwd,
    remove: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function writeGrokHomeConfig(home: string) {
  fs.writeFileSync(
    path.join(home, "config.toml"),
    `disable_web_search = true

[marketplace]
official_marketplace_auto_installed = true

[plugins]
enabled = []
`,
    { mode: 0o600 },
  );
}

function wrapGrokModel({
  model,
  bridge,
}: {
  model: LanguageModelV3;
  bridge: GrokMcpBridge;
}): LanguageModelV3 {
  let terminated = false;
  const terminate = async () => {
    if (terminated) return;
    terminated = true;
    try {
      await bridge.close();
    } catch {}
  };

  const wrapped = {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    async doGenerate(...args: unknown[]) {
      const doGenerate = getModelMethod(model, "doGenerate", Provider.GROK_CLI);
      try {
        const result = (await doGenerate(...args)) as {
          content?: unknown[];
        } & Record<string, unknown>;
        return {
          ...result,
          ...(Array.isArray(result.content)
            ? { content: result.content.map(unprefixGrokPart) }
            : {}),
        };
      } finally {
        await terminate();
      }
    },
    async doStream(...args: unknown[]) {
      const doStream = getModelMethod(model, "doStream", Provider.GROK_CLI);
      let result: { stream: ReadableStream<unknown> } & Record<string, unknown>;
      try {
        result = (await doStream(...args)) as typeof result;
      } catch (error) {
        await terminate();
        throw error;
      }
      const reader = result.stream.getReader();
      const stream = new ReadableStream<unknown>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              await terminate();
              controller.close();
              return;
            }
            controller.enqueue(unprefixGrokPart(value));
          } catch (error) {
            await terminate();
            controller.error(error);
          }
        },
        async cancel(reason) {
          await terminate();
          await reader.cancel(reason);
        },
      });
      return { ...result, stream };
    },
  };
  return wrapped as unknown as LanguageModelV3;
}

function unprefixGrokPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return part;
  const record = part as Record<string, unknown>;
  if (typeof record.toolName !== "string") return part;
  if (!record.toolName.startsWith(GROK_TOOL_NAME_PREFIX)) return part;
  return {
    ...record,
    toolName: record.toolName.slice(GROK_TOOL_NAME_PREFIX.length),
  };
}

function withLoopbackNoProxy(existing: string | undefined): string {
  const entries = (existing ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const host of ["127.0.0.1", "localhost", "::1"]) {
    if (!entries.includes(host)) entries.push(host);
  }
  return entries.join(",");
}

async function loadGrokModule() {
  return importOptionalProviderPackage(
    "ai-sdk-provider-grok-build",
    Provider.GROK_CLI,
  );
}

function withInboxZeroGrokArgs(args: readonly string[] | undefined): string[] {
  // `grok agent stdio` rejects --sandbox/--tools/--no-native-tools. Those
  // clamps have to sit on the root command, before `agent`.
  const base =
    args && args.length > 0
      ? [...args]
      : ["--no-auto-update", "agent", "stdio"];
  const extras = [
    "--sandbox",
    "strict",
    "--tools",
    "search_tool,use_tool",
    "--disable-web-search",
    "--disallowed-tools",
    "Agent",
  ];
  const agentAt = base.indexOf("agent");
  if (agentAt === -1) return [...base, ...extras];
  return [...base.slice(0, agentAt), ...extras, ...base.slice(agentAt)];
}

function copyGrokAuthIntoHome(home: string): string {
  const destDir = path.join(home, ".grok");
  fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  const dest = path.join(destDir, "auth.json");
  try {
    fs.copyFileSync(path.join(os.homedir(), ".grok", "auth.json"), dest);
    fs.chmodSync(dest, 0o600);
  } catch {}
  return dest;
}

function grokCliSettings(extra: Record<string, unknown> = {}) {
  // 1.0.4 rejects --no-native-tools after stdio; do not set inferenceOnly.
  return {
    authMethod: "cached_token",
    ...(env.GROK_CLI_PATH ? { executablePath: env.GROK_CLI_PATH } : {}),
    ...extra,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: constructor signatures vary by package
type CliConstructor = new (...args: any[]) => any;

function getGrokConstructor(
  module: CliProviderModule,
  exportName: string,
): CliConstructor {
  const ctor = module[exportName];
  if (typeof ctor !== "function") {
    throw new SafeError(
      `CLI LLM provider "${Provider.GROK_CLI}" package does not export "${exportName}". Pin ai-sdk-provider-grok-build@0.2.0.`,
    );
  }
  return ctor as CliConstructor;
}

async function importOptionalProviderPackage(
  packageName: string,
  provider: CliProvider,
) {
  try {
    return await runtimeImport(packageName);
  } catch (error) {
    const message = isMissingOptionalPackageError(error, packageName)
      ? `CLI LLM provider "${provider}" requires optional package "${packageName}". Install it in apps/web and pin an exact version before enabling this provider.`
      : `CLI LLM provider "${provider}" failed to load optional package "${packageName}". Check the installed package version and peer dependencies.`;
    const safeError = new SafeError(message);
    (safeError as Error & { cause?: unknown }).cause = error;
    throw safeError;
  }
}

function getFactory(
  module: CliProviderModule,
  exportName: string,
  provider: CliProvider,
): CliModelFactory {
  const factory = module[exportName];

  if (typeof factory !== "function") {
    throw new SafeError(
      `CLI LLM provider "${provider}" package does not export "${exportName}". Check the installed package version.`,
    );
  }

  return factory as CliModelFactory;
}

function getModelMethod(
  model: LanguageModelV3,
  methodName: "doGenerate" | "doStream",
  provider: CliProvider,
) {
  const method = model[methodName];

  if (typeof method !== "function") {
    throw new SafeError(
      `CLI LLM provider "${provider}" returned a model without ${methodName}. Check the installed package version.`,
    );
  }

  return method.bind(model) as (...args: unknown[]) => unknown;
}

function isMissingOptionalPackageError(error: unknown, packageName: string) {
  if (!(error instanceof Error)) return false;

  const code = (error as Error & { code?: string }).code;
  return code === "ERR_MODULE_NOT_FOUND" && error.message.includes(packageName);
}
