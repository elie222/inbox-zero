import type { LanguageModelV4 } from "@ai-sdk/provider";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import { Provider } from "@/utils/llms/config";

type CliProviderModule = Record<string, unknown>;

type CliModelFactory = (
  modelName: string,
  settings?: Record<string, unknown>,
) => LanguageModelV4;

type McpBridgedTool = {
  description?: string;
  inputSchema: unknown;
  execute?: (input: never, options?: unknown) => unknown;
};

type McpBridgeFactory = (
  name: string,
  tools: Record<string, McpBridgedTool>,
) => unknown;

// Each CLI provider is a community AI SDK package that is not a dependency of
// this app. Self-hosters install it themselves, so it is only ever loaded at
// runtime, after CLI_LLM_ENABLED is checked.
type CliProviderAdapter = {
  packageName: string;
  defaultModel: string;
  createModel: (
    module: CliProviderModule,
    modelName: string,
  ) => LanguageModelV4;
  // Only for CLIs that can execute Inbox Zero's AI SDK tools themselves.
  // Without it, tools passed to the CLI are left for the package to handle.
  createModelWithTools?: (
    module: CliProviderModule,
    modelName: string,
    tools: Record<string, McpBridgedTool>,
  ) => LanguageModelV4;
};

const runtimeImport = (specifier: string): Promise<CliProviderModule> =>
  import(/* webpackIgnore: true */ specifier);

const CLAUDE_CODE_MCP_SERVER_NAME = "inboxzero";
const CLAUDE_CODE_TOOL_NAME_PREFIX = `mcp__${CLAUDE_CODE_MCP_SERVER_NAME}__`;

const CLI_PROVIDER_ADAPTERS: Record<string, CliProviderAdapter> = {
  [Provider.CODEX_CLI]: {
    packageName: "ai-sdk-provider-codex-cli",
    defaultModel: "gpt-5.3-codex",
    createModel: (module, modelName) =>
      getFactory(
        module,
        "codexExec",
        Provider.CODEX_CLI,
      )(modelName, {
        allowNpx: env.CODEX_CLI_ALLOW_NPX,
        skipGitRepoCheck: true,
        approvalMode: "never",
        sandboxMode: "read-only",
        ...(env.CODEX_CLI_PATH ? { codexPath: env.CODEX_CLI_PATH } : {}),
        logger: false,
      }),
  },
  [Provider.CLAUDE_CODE]: {
    packageName: "ai-sdk-provider-claude-code",
    defaultModel: "sonnet",
    createModel: (module, modelName) =>
      getFactory(
        module,
        "claudeCode",
        Provider.CLAUDE_CODE,
      )(modelName, {
        settingSources: [],
        allowedTools: [],
        permissionMode: "default",
        sandbox: { enabled: true },
      }),
    createModelWithTools: (module, modelName, tools) => {
      const claudeCode = getFactory(module, "claudeCode", Provider.CLAUDE_CODE);
      const createBridge = getFactory(
        module,
        "createAiSdkMcpServer",
        Provider.CLAUDE_CODE,
      ) as McpBridgeFactory;

      const model = claudeCode(modelName, {
        settingSources: [],
        allowedTools: Object.keys(tools).map(
          (name) => `${CLAUDE_CODE_TOOL_NAME_PREFIX}${name}`,
        ),
        mcpServers: {
          [CLAUDE_CODE_MCP_SERVER_NAME]: createBridge(
            CLAUDE_CODE_MCP_SERVER_NAME,
            tools,
          ),
        },
        permissionMode: "default",
        sandbox: { enabled: true },
      });

      return wrapWithUnprefixedToolNames({
        model,
        prefix: CLAUDE_CODE_TOOL_NAME_PREFIX,
        provider: Provider.CLAUDE_CODE,
      });
    },
  },
};

export function isCliProvider(provider: string) {
  return Object.hasOwn(CLI_PROVIDER_ADAPTERS, provider);
}

export function supportsCliToolBridge(provider: string) {
  return Boolean(CLI_PROVIDER_ADAPTERS[provider]?.createModelWithTools);
}

export function getCliProviderDefaultModel(provider: string) {
  return getAdapter(provider).defaultModel;
}

export function assertCliLlmEnabled(provider: string) {
  if (env.CLI_LLM_ENABLED) return;

  throw new SafeError(
    `CLI LLM provider "${provider}" is disabled. Set CLI_LLM_ENABLED=true and install the matching community provider package to use it.`,
  );
}

export function createCliLanguageModel({
  provider,
  modelName,
}: {
  provider: string;
  modelName: string;
}): LanguageModelV4 {
  assertCliLlmEnabled(provider);
  const adapter = getAdapter(provider);

  let modelPromise: Promise<LanguageModelV4> | undefined;

  const getModel = () => {
    modelPromise ??= importOptionalProviderPackage(
      adapter.packageName,
      provider,
    ).then((module) => adapter.createModel(module, modelName));
    return modelPromise;
  };

  return {
    specificationVersion: "v4",
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
  } as unknown as LanguageModelV4;
}

// AI SDK tools cannot be auto-bridged at the LanguageModelV4 layer: by the
// time the wrapper sees them they have been reduced to JSON schemas with no
// `execute`. Callers that pass tools to a CLI provider must therefore use
// this helper, which hands the original tool record to the adapter.
export async function createCliLanguageModelWithTools({
  provider,
  modelName,
  tools,
}: {
  provider: string;
  modelName: string;
  tools: Record<string, McpBridgedTool>;
}): Promise<LanguageModelV4> {
  assertCliLlmEnabled(provider);
  const adapter = getAdapter(provider);
  const module = await importOptionalProviderPackage(
    adapter.packageName,
    provider,
  );

  if (!adapter.createModelWithTools || Object.keys(tools).length === 0) {
    return adapter.createModel(module, modelName);
  }

  return adapter.createModelWithTools(module, modelName, tools);
}

function getAdapter(provider: string) {
  const adapter = CLI_PROVIDER_ADAPTERS[provider];
  if (!adapter) {
    throw new SafeError(`Unsupported CLI LLM provider: ${provider}`);
  }
  return adapter;
}

// A CLI that runs Inbox Zero tools over MCP reports tool calls under its MCP
// name (e.g. `mcp__inboxzero__<name>`). Inbox Zero callers (stop conditions,
// UI part renderers, validators) match on the original tool names, so the
// prefix is stripped from every `toolName` field in both the non-streaming and
// streaming response paths before it reaches the AI SDK consumer.
function wrapWithUnprefixedToolNames({
  model,
  prefix,
  provider,
}: {
  model: LanguageModelV4;
  prefix: string;
  provider: string;
}): LanguageModelV4 {
  const unprefixPart = (part: unknown): unknown => {
    if (!part || typeof part !== "object") return part;
    const record = part as Record<string, unknown>;
    if (typeof record.toolName !== "string") return part;
    if (!record.toolName.startsWith(prefix)) return part;
    return { ...record, toolName: record.toolName.slice(prefix.length) };
  };

  const wrapped = {
    specificationVersion: model.specificationVersion,
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    async doGenerate(...args: unknown[]) {
      const doGenerate = getModelMethod(model, "doGenerate", provider);
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
      const doStream = getModelMethod(model, "doStream", provider);
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
  return wrapped as unknown as LanguageModelV4;
}

async function importOptionalProviderPackage(
  packageName: string,
  provider: string,
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
  provider: string,
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
  model: LanguageModelV4,
  methodName: "doGenerate" | "doStream",
  provider: string,
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
