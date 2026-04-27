import type { LanguageModelV3 } from "@ai-sdk/provider";
import { env } from "@/env";
import { SafeError } from "@/utils/error";
import { Provider } from "@/utils/llms/config";

type CliProvider = string;

type CliProviderModule = Record<string, unknown>;

type CliModelFactory = (
  modelName: string,
  settings?: Record<string, unknown>,
) => LanguageModelV3;

const runtimeImport = (specifier: string): Promise<CliProviderModule> =>
  import(/* webpackIgnore: true */ specifier);

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
    "ai-sdk-provider-claude-code",
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
