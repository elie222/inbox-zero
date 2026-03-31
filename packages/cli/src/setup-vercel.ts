import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import { generateSecret, isSensitiveKey, type EnvConfig } from "./utils";
import {
  LLM_PROVIDER_OPTIONS,
  promptLlmCredentials,
  seedLlmPlaceholderCredentials,
} from "./llm";

type VercelEnvironment = "production" | "preview" | "development";

type VercelEnvValue = {
  createValue?: () => string;
  key: string;
  value?: string;
  environment: VercelEnvironment;
  sensitive: boolean;
};

type GoogleConfig = {
  clientId?: string;
  clientSecret?: string;
  pubsubTopicName?: string;
};

type MicrosoftConfig = {
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
};

export type SetupVercelOptions = {
  baseUrl?: string;
  deploy?: boolean;
  project?: string;
  projectDir: string;
  region?: string;
  scope?: string;
  skipNeon?: boolean;
  skipUpstash?: boolean;
  yes?: boolean;
};

const DEFAULT_GOOGLE_PUBSUB_TOPIC =
  "projects/your-project-id/topics/inbox-zero-emails";

const SHARED_VERCEL_REGIONS = [
  "cle1",
  "fra1",
  "gru1",
  "iad1",
  "lhr1",
  "pdx1",
  "sin1",
  "syd1",
] as const;

const DEFAULT_VERCEL_REGION = "iad1";
const DEFAULT_DEVELOPMENT_BASE_URL = "http://localhost:3000";

export function buildVercelEnvValues(config: {
  authSecrets?: Partial<EnvConfig>;
  baseUrl: string;
  developmentBaseUrl?: string;
  google?: GoogleConfig;
  llmEnv: EnvConfig;
  microsoft?: MicrosoftConfig;
}): VercelEnvValue[] {
  const envValues: VercelEnvValue[] = [];
  const addTargets = (
    key: string,
    value: string | undefined,
    environments: readonly VercelEnvironment[],
    createValue?: () => string,
  ) => {
    if (value === undefined && !createValue) return;

    for (const environment of environments) {
      envValues.push({
        createValue,
        key,
        value,
        environment,
        sensitive: isSensitiveKey(key),
      });
    }
  };

  const sharedEnv: EnvConfig = {
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: "true",
    GOOGLE_CLIENT_ID: config.google?.clientId || "skipped",
    GOOGLE_CLIENT_SECRET: config.google?.clientSecret || "skipped",
    GOOGLE_PUBSUB_TOPIC_NAME:
      config.google?.pubsubTopicName || DEFAULT_GOOGLE_PUBSUB_TOPIC,
    MICROSOFT_CLIENT_ID: config.microsoft?.clientId,
    MICROSOFT_CLIENT_SECRET: config.microsoft?.clientSecret,
    MICROSOFT_TENANT_ID: config.microsoft?.tenantId,
    ...config.authSecrets,
    ...config.llmEnv,
  };
  const generatedEnvValueFactories: Partial<Record<string, () => string>> = {
    AUTH_SECRET: () => generateSecret(32),
    EMAIL_ENCRYPT_SECRET: () => generateSecret(32),
    EMAIL_ENCRYPT_SALT: () => generateSecret(16),
    INTERNAL_API_KEY: () => generateSecret(32),
    API_KEY_SALT: () => generateSecret(32),
    CRON_SECRET: () => generateSecret(32),
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: () => generateSecret(32),
    MICROSOFT_WEBHOOK_CLIENT_STATE: config.microsoft?.clientId
      ? () => generateSecret(32)
      : undefined,
  };

  for (const [key, value] of Object.entries(sharedEnv)) {
    addTargets(key, value, ["production", "preview", "development"]);
  }
  for (const [key, createValue] of Object.entries(generatedEnvValueFactories)) {
    addTargets(
      key,
      undefined,
      ["production", "preview", "development"],
      createValue,
    );
  }

  addTargets("NEXT_PUBLIC_BASE_URL", config.baseUrl, ["production", "preview"]);
  addTargets(
    "NEXT_PUBLIC_BASE_URL",
    config.developmentBaseUrl || DEFAULT_DEVELOPMENT_BASE_URL,
    ["development"],
  );

  return envValues;
}

export async function runVercelSetup(
  options: SetupVercelOptions,
): Promise<void> {
  p.intro("Inbox Zero Vercel Setup");

  requireVercelCli();
  requireVercelLogin(options.scope);

  const projectDir = resolve(options.projectDir);
  const linkedProject = hasLinkedProject(projectDir);
  const projectName = await resolveProjectName(
    options,
    projectDir,
    linkedProject,
  );
  const region = await resolveRegion(options);
  const baseUrl = await resolveBaseUrl(options, projectName);
  const deployNow = await resolveDeployPreference(options);
  const { google, microsoft } = await promptEmailProviders(options, baseUrl);
  const llmEnv = await promptVercelLlmConfig(options);

  if (!linkedProject) {
    await runVercelCommand(["link", "--yes", "--project", projectName], {
      cwd: projectDir,
      scope: options.scope,
      label: "Linking Vercel project",
    });
  } else {
    p.log.info(`Using existing Vercel link in ${projectDir}`);
  }

  if (!options.skipNeon) {
    await runVercelCommand(
      [
        "integration",
        "add",
        "neon",
        "--name",
        `${projectName}-db`,
        "--metadata",
        `region=${region}`,
        "--no-env-pull",
      ],
      {
        cwd: projectDir,
        scope: options.scope,
        label: "Provisioning Neon",
      },
    );
  }

  if (!options.skipUpstash) {
    await runVercelCommand(
      [
        "integration",
        "add",
        "upstash/upstash-kv",
        "--name",
        `${projectName}-redis`,
        "--metadata",
        `primaryRegion=${region}`,
        "--no-env-pull",
      ],
      {
        cwd: projectDir,
        scope: options.scope,
        label: "Provisioning Upstash Redis",
      },
    );
  }

  const envValues = buildVercelEnvValues({
    baseUrl,
    google,
    llmEnv,
    microsoft,
  });

  const envSpinner = p.spinner();
  envSpinner.start("Setting Vercel environment variables");
  let skippedEnvCount = 0;
  for (const envValue of envValues) {
    const inputValue = resolveEnvValue(envValue);
    const result = await runVercelProcess(
      [
        "env",
        "add",
        envValue.key,
        envValue.environment,
        "--yes",
        ...(envValue.sensitive ? ["--sensitive"] : []),
      ],
      {
        cwd: projectDir,
        scope: options.scope,
        input: `${inputValue}\n`,
      },
    );

    if (result.status === 0) continue;

    if (envValueAlreadyExists(result)) {
      if (options.yes) {
        skippedEnvCount += 1;
        continue;
      }

      const overwrite = await p.confirm({
        message: `${envValue.key} already exists for ${envValue.environment}. Overwrite it?`,
        initialValue: false,
      });
      if (p.isCancel(overwrite)) cancelSetup();

      if (!overwrite) {
        skippedEnvCount += 1;
        continue;
      }

      const updateResult = await runVercelProcess(
        [
          "env",
          "update",
          envValue.key,
          envValue.environment,
          "--yes",
          ...(envValue.sensitive ? ["--sensitive"] : []),
        ],
        {
          cwd: projectDir,
          scope: options.scope,
          input: `${resolveEnvValue(envValue)}\n`,
        },
      );

      if (updateResult.status === 0) continue;

      envSpinner.stop("Failed to set Vercel environment variables");
      p.log.error(
        updateResult.stderr ||
          updateResult.stdout ||
          "Unknown Vercel CLI error",
      );
      process.exit(1);
    }

    envSpinner.stop("Failed to set Vercel environment variables");
    p.log.error(result.stderr || result.stdout || "Unknown Vercel CLI error");
    process.exit(1);
  }
  envSpinner.stop("Vercel environment variables configured");
  if (skippedEnvCount > 0) {
    p.log.info(
      `Skipped ${skippedEnvCount} existing environment variable${skippedEnvCount === 1 ? "" : "s"}.`,
    );
  }

  if (deployNow) {
    await runVercelCommand(["deploy", "--prod"], {
      cwd: projectDir,
      scope: options.scope,
      label: "Deploying to production",
    });
  }

  const nextSteps = [
    `Base URL configured: ${baseUrl}`,
    !options.skipNeon ? "Neon connected to the Vercel project" : null,
    !options.skipUpstash
      ? "Upstash Redis connected to the Vercel project"
      : null,
    google.clientId
      ? `Google OAuth redirect URI: ${baseUrl}/api/auth/callback/google`
      : "Google env vars were seeded with placeholders and still need real values",
    microsoft.clientId
      ? `Microsoft OAuth redirect URI: ${baseUrl}/api/auth/callback/microsoft`
      : "Microsoft OAuth is optional and can be added later",
    deployNow
      ? "Production deploy requested"
      : "Run `vercel deploy --prod` when you are ready",
  ]
    .filter(Boolean)
    .join("\n");

  p.note(nextSteps, "Next Steps");
  p.outro("Vercel setup complete.");
}

function checkVercelCli(): boolean {
  const result = spawnSync("vercel", ["--version"], { stdio: "pipe" });
  return result.status === 0;
}

function requireVercelCli() {
  if (checkVercelCli()) return;

  p.log.error(
    "Vercel CLI is not installed.\nInstall it first with `pnpm i -g vercel@latest`.",
  );
  process.exit(1);
}

function requireVercelLogin(scope?: string) {
  const args = [...getVercelGlobalArgs(scope), "whoami"];
  const result = spawnSync("vercel", args, { stdio: "pipe" });
  if (result.status === 0) return;

  p.log.error(
    "Vercel CLI is not authenticated.\nRun `vercel login` and try again.",
  );
  process.exit(1);
}

function hasLinkedProject(projectDir: string) {
  return existsSync(resolve(projectDir, ".vercel/project.json"));
}

async function resolveProjectName(
  options: SetupVercelOptions,
  projectDir: string,
  linkedProject: boolean,
) {
  if (linkedProject) {
    return sanitizeProjectName(
      options.project ||
        readLinkedProjectName(projectDir) ||
        getDefaultProjectName(projectDir),
    );
  }

  if (options.project) return sanitizeProjectName(options.project);

  const defaultProjectName = sanitizeProjectName(
    getDefaultProjectName(projectDir),
  );
  if (options.yes) return defaultProjectName;

  const projectName = await p.text({
    message: "Vercel project name",
    placeholder: "inbox-zero",
    initialValue: defaultProjectName,
    validate: (value) => (value ? undefined : "Project name is required"),
  });

  if (p.isCancel(projectName)) cancelSetup();
  return sanitizeProjectName(projectName);
}

async function resolveRegion(options: SetupVercelOptions) {
  if (options.region) return options.region;
  if (options.yes) return DEFAULT_VERCEL_REGION;

  const region = await p.select({
    message: "Shared region for Neon and Upstash",
    initialValue: DEFAULT_VERCEL_REGION,
    options: SHARED_VERCEL_REGIONS.map((value) => ({
      value,
      label: value,
    })),
  });

  if (p.isCancel(region)) cancelSetup();
  return region;
}

async function resolveBaseUrl(
  options: SetupVercelOptions,
  projectName: string,
) {
  if (options.baseUrl) return options.baseUrl;

  const defaultBaseUrl = `https://${projectName}.vercel.app`;
  if (options.yes) return defaultBaseUrl;

  const baseUrl = await p.text({
    message: "Production base URL",
    placeholder: defaultBaseUrl,
    initialValue: defaultBaseUrl,
    validate: (value) => {
      if (!value) return "Base URL is required";
      try {
        new URL(value);
        return undefined;
      } catch {
        return "Enter a full URL like https://your-app.vercel.app";
      }
    },
  });

  if (p.isCancel(baseUrl)) cancelSetup();
  return baseUrl;
}

async function resolveDeployPreference(options: SetupVercelOptions) {
  if (typeof options.deploy === "boolean") return options.deploy;
  if (options.yes) return false;

  const deployNow = await p.confirm({
    message: "Deploy to production after setup?",
    initialValue: true,
  });

  if (p.isCancel(deployNow)) cancelSetup();
  return deployNow;
}

async function promptEmailProviders(
  options: SetupVercelOptions,
  baseUrl: string,
): Promise<{ google: GoogleConfig; microsoft: MicrosoftConfig }> {
  if (options.yes) {
    return { google: {}, microsoft: {} };
  }

  p.note(
    "You can leave providers unconfigured for now. The CLI will seed safe placeholders so the project can deploy, and you can replace them later in Vercel.",
    "Email Providers",
  );

  const providers = await p.multiselect({
    message: "Which email providers do you want to configure now?",
    options: [
      { value: "google", label: "Google (Gmail)" },
      { value: "microsoft", label: "Microsoft (Outlook)" },
    ],
  });

  if (p.isCancel(providers)) cancelSetup();

  const google = providers.includes("google")
    ? await promptGoogleConfig(baseUrl)
    : {};
  const microsoft = providers.includes("microsoft")
    ? await promptMicrosoftConfig(baseUrl)
    : {};

  return { google, microsoft };
}

async function promptGoogleConfig(baseUrl: string): Promise<GoogleConfig> {
  p.note(
    [
      "Use these Google OAuth redirect URIs:",
      `${baseUrl}/api/auth/callback/google`,
      `${baseUrl}/api/google/linking/callback`,
      "",
      "Paste the values now, or press Ctrl+C and come back later if you need to finish Google Cloud setup first.",
    ].join("\n"),
    "Google OAuth",
  );

  const google = await p.group(
    {
      clientId: () =>
        p.text({
          message: "Google Client ID",
          placeholder: "paste your Client ID here",
          validate: (value) => (!value ? "Client ID is required" : undefined),
        }),
      clientSecret: () =>
        p.text({
          message: "Google Client Secret",
          placeholder: "paste your Client Secret here",
          validate: (value) =>
            !value ? "Client secret is required" : undefined,
        }),
      pubsubTopicName: () =>
        p.text({
          message: "Google Pub/Sub topic name",
          placeholder: DEFAULT_GOOGLE_PUBSUB_TOPIC,
          initialValue: DEFAULT_GOOGLE_PUBSUB_TOPIC,
          validate: (value) =>
            !value ? "Pub/Sub topic name is required" : undefined,
        }),
    },
    { onCancel: cancelSetup },
  );

  return google;
}

async function promptMicrosoftConfig(
  baseUrl: string,
): Promise<MicrosoftConfig> {
  p.note(
    [
      "Use these Microsoft redirect URIs:",
      `${baseUrl}/api/auth/callback/microsoft`,
      `${baseUrl}/api/outlook/linking/callback`,
      `${baseUrl}/api/outlook/calendar/callback`,
    ].join("\n"),
    "Microsoft OAuth",
  );

  const microsoft = await p.group(
    {
      clientId: () =>
        p.text({
          message: "Microsoft Client ID",
          placeholder: "paste your Client ID here",
          validate: (value) => (!value ? "Client ID is required" : undefined),
        }),
      clientSecret: () =>
        p.text({
          message: "Microsoft Client Secret",
          placeholder: "paste your Client Secret here",
          validate: (value) =>
            !value ? "Client secret is required" : undefined,
        }),
      tenantId: () =>
        p.text({
          message: "Microsoft Tenant ID",
          placeholder: "common",
          initialValue: "common",
        }),
    },
    { onCancel: cancelSetup },
  );

  return {
    clientId: microsoft.clientId,
    clientSecret: microsoft.clientSecret,
    tenantId: microsoft.tenantId || "common",
  };
}

async function promptVercelLlmConfig(
  options: SetupVercelOptions,
): Promise<EnvConfig> {
  const llmEnv: EnvConfig = {};

  if (options.yes) {
    llmEnv.DEFAULT_LLM_PROVIDER = "openai";
    seedLlmPlaceholderCredentials("openai", llmEnv);
    return llmEnv;
  }

  const llmProvider = await p.select({
    message: "Default AI provider",
    options: [...LLM_PROVIDER_OPTIONS],
  });

  if (p.isCancel(llmProvider)) cancelSetup();
  const selectedLlmProvider = String(llmProvider);

  llmEnv.DEFAULT_LLM_PROVIDER = selectedLlmProvider;
  const configureRealKey = await p.confirm({
    message: "Add real AI credentials now?",
    initialValue: true,
  });

  if (p.isCancel(configureRealKey)) cancelSetup();

  if (configureRealKey) {
    await promptLlmCredentials(selectedLlmProvider, llmEnv);
    return llmEnv;
  }

  seedLlmPlaceholderCredentials(selectedLlmProvider, llmEnv);
  return llmEnv;
}

async function runVercelCommand(
  args: string[],
  config: {
    cwd: string;
    label: string;
    scope?: string;
  },
) {
  const spinner = p.spinner();
  spinner.start(config.label);

  const result = await runVercelProcess(args, {
    cwd: config.cwd,
    scope: config.scope,
  });

  if (result.status !== 0) {
    spinner.stop(`${config.label} failed`);
    p.log.error(result.stderr || result.stdout || "Unknown Vercel CLI error");
    process.exit(1);
  }

  spinner.stop(config.label);
}

async function runVercelProcess(
  args: string[],
  config: {
    cwd: string;
    input?: string;
    scope?: string;
  },
) {
  return await new Promise<{
    status: number;
    stderr: string;
    stdout: string;
  }>((resolvePromise) => {
    const child = spawn(
      "vercel",
      [...getVercelGlobalArgs(config.scope), ...args],
      {
        cwd: config.cwd,
        stdio: "pipe",
      },
    );

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("close", (code) => {
      resolvePromise({
        status: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
      });
    });

    child.on("error", (error) => {
      resolvePromise({
        status: 1,
        stdout: "",
        stderr: error.message,
      });
    });

    child.stdin.end(config.input);
  });
}

function getVercelGlobalArgs(scope?: string) {
  return scope ? ["--scope", scope] : [];
}

function resolveEnvValue(envValue: VercelEnvValue) {
  return envValue.value ?? envValue.createValue?.() ?? "";
}

function envValueAlreadyExists(result: { stderr: string; stdout: string }) {
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return output.includes("already exists");
}

function sanitizeProjectName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function getDefaultProjectName(projectDir: string) {
  const currentName = basename(projectDir);
  const parentName = basename(dirname(projectDir));
  if (currentName === "web" && parentName === "apps") {
    return basename(resolve(projectDir, "../.."));
  }

  return currentName;
}

function readLinkedProjectName(projectDir: string) {
  const projectFile = resolve(projectDir, ".vercel/project.json");
  if (!existsSync(projectFile)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(projectFile, "utf8")) as {
      projectName?: string;
    };
    return parsed.projectName?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function cancelSetup(): never {
  p.cancel("Setup cancelled.");
  process.exit(0);
}
