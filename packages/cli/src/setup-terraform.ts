import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import * as p from "@clack/prompts";

const DEFAULT_APP_NAME = "inbox-zero";
const DEFAULT_ENVIRONMENT = "production";
const DEFAULT_REGION = "us-east-1";
const DEFAULT_OUTPUT_DIR_NAME = "terraform";

const RDS_INSTANCE_OPTIONS = [
  {
    value: "db.t3.micro",
    label: "db.t3.micro (~$12/mo)",
    hint: "1 vCPU, 1GB RAM - good for 1-5 users",
  },
  {
    value: "db.t3.small",
    label: "db.t3.small (~$24/mo)",
    hint: "2 vCPU, 2GB RAM - good for 5-20 users",
  },
  {
    value: "db.t3.medium",
    label: "db.t3.medium (~$48/mo)",
    hint: "2 vCPU, 4GB RAM - good for 20-100 users",
  },
  {
    value: "db.t3.large",
    label: "db.t3.large (~$96/mo)",
    hint: "2 vCPU, 8GB RAM - good for 100+ users",
  },
];

const REDIS_INSTANCE_OPTIONS = [
  {
    value: "cache.t4g.micro",
    label: "cache.t4g.micro (~$12/mo)",
    hint: "0.5 GiB - good for <100 users",
  },
  {
    value: "cache.t4g.small",
    label: "cache.t4g.small (~$24/mo)",
    hint: "1.37 GiB - good for 100-500 users",
  },
  {
    value: "cache.t4g.medium",
    label: "cache.t4g.medium (~$48/mo)",
    hint: "3.09 GiB - good for 500+ users",
  },
];

const LLM_PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "groq", label: "Groq" },
  { value: "aigateway", label: "AI Gateway" },
  { value: "bedrock", label: "AWS Bedrock" },
  { value: "ollama", label: "Ollama (self-hosted)" },
  { value: "openai-compatible", label: "OpenAI-Compatible (self-hosted)" },
];

interface TerraformSetupOptions {
  outputDir?: string;
  environment?: string;
  region?: string;
  baseUrl?: string;
  domainName?: string;
  acmCertificateArn?: string;
  route53ZoneId?: string;
  rdsInstanceClass?: string;
  enableRedis?: boolean;
  redisInstanceClass?: string;
  llmProvider?: string;
  llmModel?: string;
  llmApiKey?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  googlePubsubTopicName?: string;
  bedrockAccessKey?: string;
  bedrockSecretKey?: string;
  bedrockRegion?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  openaiCompatibleBaseUrl?: string;
  openaiCompatibleModel?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
  yes?: boolean;
}

interface TerraformVarsConfig {
  appName: string;
  environment: string;
  region: string;
  baseUrl: string;
  domainName: string;
  route53ZoneId: string;
  acmCertificateArn: string;
  rdsInstanceClass: string;
  enableRedis: boolean;
  redisInstanceClass: string;
  googleClientId: string;
  googleClientSecret: string;
  googlePubsubTopicName: string;
  defaultLlmProvider: string;
  defaultLlmModel: string;
  llmApiKey?: string;
  bedrockAccessKey?: string;
  bedrockSecretKey?: string;
  bedrockRegion?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  openaiCompatibleBaseUrl?: string;
  openaiCompatibleModel?: string;
  microsoftClientId?: string;
  microsoftClientSecret?: string;
}

export async function runTerraformSetup(options: TerraformSetupOptions) {
  p.intro("Terraform Setup for Inbox Zero");

  const nonInteractive = options.yes === true;
  const outputDir = resolveOutputDir(options.outputDir);
  await ensureOutputDir(outputDir, nonInteractive);

  const environment =
    options.environment ||
    (nonInteractive
      ? DEFAULT_ENVIRONMENT
      : await promptRequiredText({
          message: "Environment name:",
          placeholder: DEFAULT_ENVIRONMENT,
          initialValue: DEFAULT_ENVIRONMENT,
        }));

  const region =
    options.region ||
    (nonInteractive
      ? DEFAULT_REGION
      : await promptRequiredText({
          message: "AWS region:",
          placeholder: DEFAULT_REGION,
          initialValue: DEFAULT_REGION,
        }));

  const baseUrlInput =
    options.baseUrl ||
    (nonInteractive
      ? ""
      : await promptOptionalText({
          message: "Public base URL (leave empty to use ALB DNS name):",
          placeholder: "https://app.example.com",
        }));

  const normalizedBaseUrl = normalizeBaseUrl(baseUrlInput);
  let domainName = options.domainName || normalizedBaseUrl.domainName;
  if (!nonInteractive && !normalizedBaseUrl.baseUrl && !domainName) {
    const domainInput = await promptOptionalText({
      message: "Custom domain name (optional):",
      placeholder: "app.example.com",
    });
    domainName = domainInput || domainName;
  }

  let acmCertificateArn =
    options.acmCertificateArn ||
    (nonInteractive
      ? ""
      : await promptOptionalText({
          message: "ACM certificate ARN (optional for HTTPS):",
          placeholder: "arn:aws:acm:us-east-1:123456789012:certificate/...",
        }));

  let route53ZoneId =
    options.route53ZoneId ||
    (nonInteractive
      ? ""
      : await promptOptionalText({
          message: "Route53 hosted zone ID (optional):",
          placeholder: "Z123EXAMPLE",
        }));

  if (!nonInteractive && domainName) {
    if (!acmCertificateArn) {
      acmCertificateArn = await promptOptionalText({
        message: "ACM certificate ARN for HTTPS (optional):",
        placeholder: "arn:aws:acm:us-east-1:123456789012:certificate/...",
      });
    }
    if (!route53ZoneId) {
      route53ZoneId = await promptOptionalText({
        message: "Route53 hosted zone ID for DNS (optional):",
        placeholder: "Z123EXAMPLE",
      });
    }
  }

  const validatedRdsInstanceClass = validateInstanceClass(
    options.rdsInstanceClass,
    RDS_INSTANCE_OPTIONS,
    nonInteractive,
    "RDS instance class",
  );
  const rdsInstanceClass =
    validatedRdsInstanceClass ||
    (nonInteractive
      ? "db.t3.micro"
      : await promptSelect({
          message: "RDS instance size:",
          options: RDS_INSTANCE_OPTIONS,
        }));

  const enableRedis =
    options.enableRedis !== undefined
      ? options.enableRedis
      : nonInteractive
        ? false
        : await promptConfirm({
            message: "Enable Redis for real-time features?",
            initialValue: true,
          });

  const validatedRedisInstanceClass = enableRedis
    ? validateInstanceClass(
        options.redisInstanceClass,
        REDIS_INSTANCE_OPTIONS,
        nonInteractive,
        "Redis instance class",
      )
    : undefined;
  const redisInstanceClass = enableRedis
    ? validatedRedisInstanceClass ||
      (nonInteractive
        ? "cache.t4g.micro"
        : await promptSelect({
            message: "Redis instance size:",
            options: REDIS_INSTANCE_OPTIONS,
          }))
    : "cache.t4g.micro";

  const googleClientId =
    options.googleClientId ||
    process.env.GOOGLE_CLIENT_ID ||
    (nonInteractive
      ? ""
      : await promptRequiredText({
          message: "Google OAuth Client ID:",
          placeholder: "1234567890.apps.googleusercontent.com",
        }));

  const googleClientSecret =
    options.googleClientSecret ||
    process.env.GOOGLE_CLIENT_SECRET ||
    (nonInteractive
      ? ""
      : await promptRequiredText({
          message: "Google OAuth Client Secret:",
          placeholder: "GOCSPX-...",
        }));

  const googlePubsubTopicName =
    options.googlePubsubTopicName ||
    process.env.GOOGLE_PUBSUB_TOPIC_NAME ||
    (nonInteractive
      ? ""
      : await promptRequiredText({
          message: "Google Pub/Sub topic name:",
          placeholder: "projects/your-project/topics/inbox-zero-emails",
        }));

  if (nonInteractive) {
    assertNonEmpty("GOOGLE_CLIENT_ID", googleClientId);
    assertNonEmpty("GOOGLE_CLIENT_SECRET", googleClientSecret);
    assertNonEmpty("GOOGLE_PUBSUB_TOPIC_NAME", googlePubsubTopicName);
  }

  const validatedLlmProvider = validateLlmProvider(
    options.llmProvider,
    nonInteractive,
  );
  const llmProvider =
    validatedLlmProvider ||
    (nonInteractive
      ? ""
      : await promptSelect({
          message: "Default LLM provider:",
          options: LLM_PROVIDER_OPTIONS,
        }));
  if (nonInteractive) {
    assertNonEmpty("DEFAULT_LLM_PROVIDER", llmProvider);
  }

  const llmModel =
    options.llmModel ||
    (nonInteractive
      ? ""
      : await promptOptionalText({
          message: "Default LLM model (optional):",
          placeholder: "leave empty for provider default",
        }));

  const llmSecrets = await getLlmSecrets({
    provider: llmProvider,
    options,
    nonInteractive,
  });

  const configureMicrosoft =
    options.microsoftClientId ||
    options.microsoftClientSecret ||
    process.env.MICROSOFT_CLIENT_ID ||
    process.env.MICROSOFT_CLIENT_SECRET ||
    (nonInteractive
      ? false
      : await promptConfirm({
          message: "Configure Microsoft OAuth?",
          initialValue: false,
        }));

  const microsoftClientId = configureMicrosoft
    ? options.microsoftClientId ||
      process.env.MICROSOFT_CLIENT_ID ||
      (nonInteractive
        ? ""
        : await promptRequiredText({
            message: "Microsoft OAuth Client ID:",
            placeholder: "00000000-0000-0000-0000-000000000000",
          }))
    : "";

  const microsoftClientSecret = configureMicrosoft
    ? options.microsoftClientSecret ||
      process.env.MICROSOFT_CLIENT_SECRET ||
      (nonInteractive
        ? ""
        : await promptRequiredText({
            message: "Microsoft OAuth Client Secret:",
            placeholder: "paste your secret",
          }))
    : "";

  if (configureMicrosoft && nonInteractive) {
    assertNonEmpty("MICROSOFT_CLIENT_ID", microsoftClientId);
    assertNonEmpty("MICROSOFT_CLIENT_SECRET", microsoftClientSecret);
  }

  const config: TerraformVarsConfig = {
    appName: DEFAULT_APP_NAME,
    environment,
    region,
    baseUrl: normalizedBaseUrl.baseUrl,
    domainName,
    route53ZoneId,
    acmCertificateArn,
    rdsInstanceClass,
    enableRedis,
    redisInstanceClass,
    googleClientId,
    googleClientSecret,
    googlePubsubTopicName,
    defaultLlmProvider: llmProvider,
    defaultLlmModel: llmModel,
    microsoftClientId,
    microsoftClientSecret,
    ...llmSecrets,
  };

  const files = buildTerraformFiles(config);
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(resolve(outputDir, filename), content);
  }

  p.note(
    `Terraform files written to:\n${outputDir}\n\n` +
      "Note: terraform.tfvars contains secrets. Do not commit it.",
    "Output",
  );
  const verificationTokenPath = `/${DEFAULT_APP_NAME}/${environment}/secrets/GOOGLE_PUBSUB_VERIFICATION_TOKEN`;
  p.note(
    `cd ${outputDir}\nterraform init\nterraform apply\n\n` +
      "After apply, use `terraform output service_url` for the URL.\n" +
      `Google Pub/Sub verification token (SSM): ${verificationTokenPath}\n` +
      `aws ssm get-parameter --name ${verificationTokenPath} --with-decryption`,
    "Next Steps",
  );
  p.outro("Terraform setup complete!");
}

function resolveOutputDir(outputDir?: string) {
  const repoRoot = findRepoRoot() ?? process.cwd();
  if (!outputDir) {
    return resolve(repoRoot, DEFAULT_OUTPUT_DIR_NAME);
  }
  return resolve(process.cwd(), outputDir);
}

async function ensureOutputDir(outputDir: string, nonInteractive: boolean) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    return;
  }

  const existingFiles = readdirSync(outputDir);
  if (existingFiles.length === 0) {
    return;
  }

  if (nonInteractive) {
    p.log.error(
      `Output directory is not empty: ${outputDir}\n` +
        "Choose a new directory or remove existing files.",
    );
    process.exit(1);
  }

  const confirm = await p.confirm({
    message: `Output directory is not empty. Overwrite files in ${outputDir}?`,
    initialValue: false,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
}

async function getLlmSecrets(config: {
  provider: string;
  options: TerraformSetupOptions;
  nonInteractive: boolean;
}): Promise<Partial<TerraformVarsConfig>> {
  switch (config.provider) {
    case "anthropic": {
      const llmApiKey =
        config.options.llmApiKey ||
        process.env.LLM_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "Anthropic API key:",
              placeholder: "sk-ant-...",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("LLM_API_KEY", llmApiKey);
      }
      return { llmApiKey };
    }
    case "openai": {
      const llmApiKey =
        config.options.llmApiKey ||
        process.env.LLM_API_KEY ||
        process.env.OPENAI_API_KEY ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "OpenAI API key:",
              placeholder: "sk-...",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("LLM_API_KEY", llmApiKey);
      }
      return { llmApiKey };
    }
    case "google": {
      const llmApiKey =
        config.options.llmApiKey ||
        process.env.LLM_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "Google API key:",
              placeholder: "AIza...",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("LLM_API_KEY", llmApiKey);
      }
      return { llmApiKey };
    }
    case "openrouter": {
      const llmApiKey =
        config.options.llmApiKey ||
        process.env.LLM_API_KEY ||
        process.env.OPENROUTER_API_KEY ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "OpenRouter API key:",
              placeholder: "sk-or-...",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("LLM_API_KEY", llmApiKey);
      }
      return { llmApiKey };
    }
    case "groq": {
      const llmApiKey =
        config.options.llmApiKey ||
        process.env.LLM_API_KEY ||
        process.env.GROQ_API_KEY ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "Groq API key:",
              placeholder: "gsk_...",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("LLM_API_KEY", llmApiKey);
      }
      return { llmApiKey };
    }
    case "aigateway": {
      const llmApiKey =
        config.options.llmApiKey ||
        process.env.LLM_API_KEY ||
        process.env.AI_GATEWAY_API_KEY ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "AI Gateway API key:",
              placeholder: "sk-...",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("LLM_API_KEY", llmApiKey);
      }
      return { llmApiKey };
    }
    case "bedrock": {
      const bedrockAccessKey =
        config.options.bedrockAccessKey ||
        process.env.BEDROCK_ACCESS_KEY ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "AWS access key (Bedrock):",
              placeholder: "AKIA...",
            }));
      const bedrockSecretKey =
        config.options.bedrockSecretKey ||
        process.env.BEDROCK_SECRET_KEY ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "AWS secret key (Bedrock):",
              placeholder: "paste your secret",
            }));
      const bedrockRegion =
        config.options.bedrockRegion ||
        process.env.BEDROCK_REGION ||
        (config.nonInteractive
          ? "us-west-2"
          : await promptOptionalText({
              message: "AWS region for Bedrock:",
              placeholder: "us-west-2",
              initialValue: "us-west-2",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("BEDROCK_ACCESS_KEY", bedrockAccessKey);
        assertNonEmpty("BEDROCK_SECRET_KEY", bedrockSecretKey);
      }
      return { bedrockAccessKey, bedrockSecretKey, bedrockRegion };
    }
    case "ollama": {
      const ollamaBaseUrl =
        config.options.ollamaBaseUrl ||
        process.env.OLLAMA_BASE_URL ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "Ollama base URL:",
              placeholder: "http://localhost:11434/api",
            }));
      const ollamaModel =
        config.options.ollamaModel ||
        process.env.OLLAMA_MODEL ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "Ollama model:",
              placeholder: "llama3",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("OLLAMA_BASE_URL", ollamaBaseUrl);
        assertNonEmpty("OLLAMA_MODEL", ollamaModel);
      }
      return { ollamaBaseUrl, ollamaModel };
    }
    case "openai-compatible": {
      const openaiCompatibleBaseUrl =
        config.options.openaiCompatibleBaseUrl ||
        process.env.OPENAI_COMPATIBLE_BASE_URL ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "OpenAI-compatible base URL:",
              placeholder: "http://localhost:1234/v1",
            }));
      const openaiCompatibleModel =
        config.options.openaiCompatibleModel ||
        process.env.OPENAI_COMPATIBLE_MODEL ||
        (config.nonInteractive
          ? ""
          : await promptRequiredText({
              message: "Model name:",
              placeholder: "llama-3.2-3b-instruct",
            }));
      const openaiCompatibleApiKey =
        config.options.llmApiKey ||
        process.env.LLM_API_KEY ||
        (config.nonInteractive
          ? ""
          : await promptOptionalText({
              message: "API key (optional — press Enter to skip):",
              placeholder: "leave blank if not required",
            }));
      if (config.nonInteractive) {
        assertNonEmpty("OPENAI_COMPATIBLE_BASE_URL", openaiCompatibleBaseUrl);
        assertNonEmpty("OPENAI_COMPATIBLE_MODEL", openaiCompatibleModel);
      }
      return {
        openaiCompatibleBaseUrl,
        openaiCompatibleModel,
        llmApiKey: openaiCompatibleApiKey || undefined,
      };
    }
    default:
      return {};
  }
}

async function promptRequiredText(config: {
  message: string;
  placeholder?: string;
  initialValue?: string;
}) {
  const value = await p.text({
    message: config.message,
    placeholder: config.placeholder,
    initialValue: config.initialValue,
    validate: (input) => (input ? undefined : "This value is required"),
  });
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value.trim();
}

async function promptOptionalText(config: {
  message: string;
  placeholder?: string;
  initialValue?: string;
}) {
  const value = await p.text({
    message: config.message,
    placeholder: config.placeholder,
    initialValue: config.initialValue,
  });
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value.trim();
}

async function promptSelect(config: {
  message: string;
  options: { value: string; label: string; hint?: string }[];
  initialValue?: string;
}) {
  const value = await p.select({
    message: config.message,
    options: config.options,
    initialValue: config.initialValue,
  });
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value as string;
}

function validateLlmProvider(
  value: string | undefined,
  nonInteractive: boolean,
): string | undefined {
  if (!value) return undefined;
  const allowed = new Set(LLM_PROVIDER_OPTIONS.map((option) => option.value));
  if (allowed.has(value)) return value;
  if (nonInteractive) {
    p.log.error(
      `Invalid LLM provider: ${value}. ` +
        `Use one of: ${[...allowed].join(", ")}`,
    );
    process.exit(1);
  }
  p.log.warn(`Unknown LLM provider "${value}". Please choose a valid option.`);
  return undefined;
}

function validateInstanceClass(
  value: string | undefined,
  options: { value: string }[],
  nonInteractive: boolean,
  label: string,
): string | undefined {
  if (!value) return undefined;
  const allowed = new Set(options.map((option) => option.value));
  if (allowed.has(value)) return value;
  if (nonInteractive) {
    p.log.error(
      `Invalid ${label}: ${value}. Use one of: ${[...allowed].join(", ")}`,
    );
    process.exit(1);
  }
  p.log.warn(`Unknown ${label} "${value}". Please choose a valid option.`);
  return undefined;
}

async function promptConfirm(config: {
  message: string;
  initialValue?: boolean;
}) {
  const value = await p.confirm({
    message: config.message,
    initialValue: config.initialValue ?? false,
  });
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return value as boolean;
}

function normalizeBaseUrl(input: string) {
  if (!input) {
    return { baseUrl: "", domainName: "" };
  }
  let baseUrl = input.trim();
  if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
    baseUrl = `https://${baseUrl}`;
  }
  try {
    const url = new URL(baseUrl);
    return {
      baseUrl: `${url.protocol}//${url.host}`,
      domainName: url.hostname,
    };
  } catch {
    return { baseUrl, domainName: "" };
  }
}

function assertNonEmpty(name: string, value: string) {
  if (!value) {
    p.log.error(
      `Missing ${name}. Provide it as an option or environment variable.`,
    );
    process.exit(1);
  }
}

function buildTerraformFiles(config: TerraformVarsConfig) {
  return {
    "versions.tf": TERRAFORM_VERSIONS_TF,
    "main.tf": TERRAFORM_MAIN_TF,
    "variables.tf": TERRAFORM_VARIABLES_TF,
    "outputs.tf": TERRAFORM_OUTPUTS_TF,
    "terraform.tfvars": renderTerraformTfvars(config),
    "README.md": TERRAFORM_README_MD,
    ".gitignore": TERRAFORM_GITIGNORE,
  };
}

function renderTerraformTfvars(config: TerraformVarsConfig) {
  const lines = [
    `app_name = "${escapeTfValue(config.appName)}"`,
    `environment = "${escapeTfValue(config.environment)}"`,
    `region = "${escapeTfValue(config.region)}"`,
  ];

  if (config.baseUrl) {
    lines.push(`base_url = "${escapeTfValue(config.baseUrl)}"`);
  }

  if (config.domainName) {
    lines.push(`domain_name = "${escapeTfValue(config.domainName)}"`);
  }

  if (config.route53ZoneId) {
    lines.push(`route53_zone_id = "${escapeTfValue(config.route53ZoneId)}"`);
  }

  if (config.acmCertificateArn) {
    lines.push(
      `acm_certificate_arn = "${escapeTfValue(config.acmCertificateArn)}"`,
    );
  }

  lines.push(`db_instance_class = "${escapeTfValue(config.rdsInstanceClass)}"`);
  lines.push(`enable_redis = ${config.enableRedis}`);
  if (config.enableRedis) {
    lines.push(
      `redis_instance_class = "${escapeTfValue(config.redisInstanceClass)}"`,
    );
  }

  lines.push(`google_client_id = "${escapeTfValue(config.googleClientId)}"`);
  lines.push(
    `google_client_secret = "${escapeTfValue(config.googleClientSecret)}"`,
  );
  lines.push(
    `google_pubsub_topic_name = "${escapeTfValue(
      config.googlePubsubTopicName,
    )}"`,
  );

  lines.push(
    `default_llm_provider = "${escapeTfValue(config.defaultLlmProvider)}"`,
  );
  if (config.defaultLlmModel) {
    lines.push(
      `default_llm_model = "${escapeTfValue(config.defaultLlmModel)}"`,
    );
  }

  addOptionalTfVar(lines, "llm_api_key", config.llmApiKey);
  addOptionalTfVar(lines, "bedrock_access_key", config.bedrockAccessKey);
  addOptionalTfVar(lines, "bedrock_secret_key", config.bedrockSecretKey);
  addOptionalTfVar(lines, "bedrock_region", config.bedrockRegion);
  addOptionalTfVar(lines, "ollama_base_url", config.ollamaBaseUrl);
  addOptionalTfVar(lines, "ollama_model", config.ollamaModel);
  addOptionalTfVar(
    lines,
    "openai_compatible_base_url",
    config.openaiCompatibleBaseUrl,
  );
  addOptionalTfVar(
    lines,
    "openai_compatible_model",
    config.openaiCompatibleModel,
  );
  addOptionalTfVar(lines, "microsoft_client_id", config.microsoftClientId);
  addOptionalTfVar(
    lines,
    "microsoft_client_secret",
    config.microsoftClientSecret,
  );

  lines.push("");
  return lines.join("\n");
}

function escapeTfValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function addOptionalTfVar(lines: string[], key: string, value?: string) {
  if (!value) return;
  lines.push(`${key} = "${escapeTfValue(value)}"`);
}

function findRepoRoot(): string | null {
  const cwd = process.cwd();
  const repoRoot = resolve(cwd, "apps/web");
  if (existsSync(repoRoot)) {
    return cwd;
  }
  const nestedRoot = resolve(cwd, "../../apps/web");
  if (existsSync(nestedRoot)) {
    return resolve(cwd, "../..");
  }
  return null;
}

const TERRAFORM_VERSIONS_TF = `terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.28.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}
`;

const TERRAFORM_MAIN_TF = `provider "aws" {
  region = var.region
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix       = "\${var.app_name}-\${var.environment}"
  tags              = { app = var.app_name, environment = var.environment }
  vpc_id            = var.create_vpc ? module.vpc[0].vpc_id : var.vpc_id
  public_subnet_ids = var.create_vpc ? module.vpc[0].public_subnets : var.public_subnet_ids
  private_subnet_ids = var.create_vpc ? module.vpc[0].private_subnets : var.private_subnet_ids
  base_url = var.base_url != "" ? var.base_url : (var.domain_name != "" && var.acm_certificate_arn != "" ? "https://\${var.domain_name}" : (var.domain_name != "" ? "http://\${var.domain_name}" : "http://\${aws_lb.app.dns_name}"))
  ssm_prefix = "/\${var.app_name}/\${var.environment}/secrets"
}

module "vpc" {
  count  = var.create_vpc ? 1 : 0
  source = "terraform-aws-modules/vpc/aws"

  name = "\${local.name_prefix}-vpc"
  cidr = var.vpc_cidr

  azs             = slice(data.aws_availability_zones.available.names, 0, length(var.public_subnet_cidrs))
  public_subnets  = var.public_subnet_cidrs
  private_subnets = var.private_subnet_cidrs

  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = local.tags
}

resource "aws_security_group" "alb" {
  name        = "\${local.name_prefix}-alb"
  description = "ALB security group"
  vpc_id      = local.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_security_group" "ecs" {
  name        = "\${local.name_prefix}-ecs"
  description = "ECS service security group"
  vpc_id      = local.vpc_id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_security_group" "db" {
  name        = "\${local.name_prefix}-db"
  description = "RDS security group"
  vpc_id      = local.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_security_group" "redis" {
  count = var.enable_redis ? 1 : 0

  name        = "\${local.name_prefix}-redis"
  description = "Redis security group"
  vpc_id      = local.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.tags
}

resource "aws_lb" "app" {
  name               = "\${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = local.public_subnet_ids

  tags = local.tags
}

resource "aws_lb_target_group" "app" {
  name        = "\${local.name_prefix}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    path                = "/"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_lb_listener" "https" {
  count = var.acm_certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.acm_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-2016-08"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_route53_record" "app" {
  count = var.route53_zone_id != "" && var.domain_name != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "\${local.name_prefix}-db-subnets"
  subnet_ids = local.private_subnet_ids
  tags       = local.tags
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier              = "\${local.name_prefix}-db"
  engine                  = "postgres"
  engine_version          = "16.6"
  instance_class          = var.db_instance_class
  allocated_storage       = var.db_allocated_storage
  max_allocated_storage   = var.db_max_allocated_storage
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = var.db_name
  username                = var.db_username
  password                = random_password.db_password.result
  db_subnet_group_name    = aws_db_subnet_group.main.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  publicly_accessible     = false
  backup_retention_period = 7
  deletion_protection     = true
  multi_az                = false
  auto_minor_version_upgrade = true
  apply_immediately       = true
  skip_final_snapshot     = false

  tags = local.tags
}

resource "aws_elasticache_subnet_group" "main" {
  count = var.enable_redis ? 1 : 0

  name       = "\${local.name_prefix}-redis-subnets"
  subnet_ids = local.private_subnet_ids
  tags       = local.tags
}

resource "random_password" "redis_auth" {
  count   = var.enable_redis ? 1 : 0
  length  = 32
  special = false
}

resource "aws_elasticache_replication_group" "main" {
  count = var.enable_redis ? 1 : 0

  replication_group_id          = "\${local.name_prefix}-redis"
  description                   = "Redis for Inbox Zero"
  engine                        = "redis"
  engine_version                = "7.1"
  node_type                     = var.redis_instance_class
  num_node_groups               = 1
  replicas_per_node_group       = 0
  automatic_failover_enabled    = false
  port                          = 6379
  transit_encryption_enabled    = true
  at_rest_encryption_enabled    = true
  auth_token                    = random_password.redis_auth[0].result
  subnet_group_name             = aws_elasticache_subnet_group.main[0].name
  security_group_ids            = [aws_security_group.redis[0].id]

  tags = local.tags
}

resource "random_password" "generated" {
  for_each = {
    AUTH_SECRET                   = 32
    EMAIL_ENCRYPT_SECRET          = 32
    EMAIL_ENCRYPT_SALT            = 16
    INTERNAL_API_KEY              = 32
    API_KEY_SALT                  = 32
    CRON_SECRET                   = 32
    GOOGLE_PUBSUB_VERIFICATION_TOKEN = 32
    MICROSOFT_WEBHOOK_CLIENT_STATE = 32
  }
  length  = each.value
  special = false
}

locals {
  database_url = format(
    "postgresql://%s:%s@%s:%s/%s?schema=public&sslmode=require",
    var.db_username,
    random_password.db_password.result,
    aws_db_instance.main.address,
    aws_db_instance.main.port,
    var.db_name
  )
  direct_url = local.database_url
  redis_url = var.enable_redis ? format(
    "rediss://:%s@%s:%s",
    random_password.redis_auth[0].result,
    aws_elasticache_replication_group.main[0].primary_endpoint_address,
    aws_elasticache_replication_group.main[0].port
  ) : ""

  microsoft_enabled = var.microsoft_client_id != "" && var.microsoft_client_secret != ""
  generated_secrets = {
    AUTH_SECRET                = random_password.generated["AUTH_SECRET"].result
    EMAIL_ENCRYPT_SECRET       = random_password.generated["EMAIL_ENCRYPT_SECRET"].result
    EMAIL_ENCRYPT_SALT         = random_password.generated["EMAIL_ENCRYPT_SALT"].result
    INTERNAL_API_KEY           = random_password.generated["INTERNAL_API_KEY"].result
    API_KEY_SALT               = random_password.generated["API_KEY_SALT"].result
    CRON_SECRET                = random_password.generated["CRON_SECRET"].result
    GOOGLE_PUBSUB_VERIFICATION_TOKEN = random_password.generated["GOOGLE_PUBSUB_VERIFICATION_TOKEN"].result
  }
  required_secrets = {
    GOOGLE_CLIENT_ID         = var.google_client_id
    GOOGLE_CLIENT_SECRET     = var.google_client_secret
    GOOGLE_PUBSUB_TOPIC_NAME = var.google_pubsub_topic_name
    DATABASE_URL             = local.database_url
    DIRECT_URL               = local.direct_url
  }
  optional_secrets = merge(
    var.enable_redis ? { REDIS_URL = local.redis_url } : {},
    local.microsoft_enabled ? {
      MICROSOFT_CLIENT_ID          = var.microsoft_client_id
      MICROSOFT_CLIENT_SECRET      = var.microsoft_client_secret
      MICROSOFT_WEBHOOK_CLIENT_STATE = random_password.generated["MICROSOFT_WEBHOOK_CLIENT_STATE"].result
    } : {},
    var.llm_api_key != "" ? { LLM_API_KEY = var.llm_api_key } : {},
    var.bedrock_access_key != "" ? { BEDROCK_ACCESS_KEY = var.bedrock_access_key } : {},
    var.bedrock_secret_key != "" ? { BEDROCK_SECRET_KEY = var.bedrock_secret_key } : {}
  )
  secret_values = merge(local.generated_secrets, local.required_secrets, local.optional_secrets)

  container_environment = [
    for item in [
      { name = "NODE_ENV", value = "production" },
      { name = "HOSTNAME", value = "0.0.0.0" },
      { name = "NEXT_PUBLIC_BASE_URL", value = local.base_url },
      { name = "DEFAULT_LLM_PROVIDER", value = var.default_llm_provider },
      var.default_llm_model != "" ? { name = "DEFAULT_LLM_MODEL", value = var.default_llm_model } : null,
      var.bedrock_region != "" ? { name = "BEDROCK_REGION", value = var.bedrock_region } : null,
      var.ollama_base_url != "" ? { name = "OLLAMA_BASE_URL", value = var.ollama_base_url } : null,
      var.ollama_model != "" ? { name = "OLLAMA_MODEL", value = var.ollama_model } : null,
      var.openai_compatible_base_url != "" ? { name = "OPENAI_COMPATIBLE_BASE_URL", value = var.openai_compatible_base_url } : null,
      var.openai_compatible_model != "" ? { name = "OPENAI_COMPATIBLE_MODEL", value = var.openai_compatible_model } : null
    ] : item if item != null
  ]
}

resource "aws_ssm_parameter" "secrets" {
  for_each = local.secret_values
  name     = "\${local.ssm_prefix}/\${each.key}"
  type     = "SecureString"
  value    = each.value
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/\${local.name_prefix}"
  retention_in_days = 30
  tags              = local.tags
}

data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "task_execution" {
  name               = "\${local.name_prefix}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
  tags               = local.tags
}

resource "aws_iam_role" "task" {
  name               = "\${local.name_prefix}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task_execution_ssm" {
  statement {
    actions = [
      "ssm:GetParameters",
      "ssm:GetParameter",
      "ssm:GetParametersByPath"
    ]
    resources = [for param in aws_ssm_parameter.secrets : param.arn]
  }

  statement {
    actions   = ["kms:Decrypt"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task_execution_ssm" {
  name   = "\${local.name_prefix}-ssm"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_ssm.json
}

resource "aws_ecs_cluster" "main" {
  name = "\${local.name_prefix}-cluster"
  tags = local.tags
}

locals {
  container_secrets = [
    for key, param in aws_ssm_parameter.secrets : {
      name      = key
      valueFrom = param.arn
    }
  ]
}

resource "aws_ecs_task_definition" "app" {
  family                   = "\${local.name_prefix}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = var.container_image
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = local.container_environment
      secrets     = local.container_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.region
          awslogs-stream-prefix = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "app" {
  name                               = "\${local.name_prefix}-web"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.app.arn
  desired_count                      = var.desired_count
  launch_type                        = "FARGATE"
  enable_execute_command             = true
  health_check_grace_period_seconds  = 320

  network_configuration {
    subnets         = local.private_subnet_ids
    security_groups = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "web"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.http]
}
`;

const TERRAFORM_VARIABLES_TF = `variable "app_name" {
  type    = string
  default = "inbox-zero"
}

variable "environment" {
  type    = string
  default = "production"
}

variable "region" {
  type = string

  validation {
    condition     = var.region != ""
    error_message = "region is required."
  }
}

variable "base_url" {
  type    = string
  default = ""
}

variable "domain_name" {
  type    = string
  default = ""
}

variable "route53_zone_id" {
  type    = string
  default = ""
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "container_image" {
  type    = string
  default = "ghcr.io/elie222/inbox-zero:latest"
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "cpu" {
  type    = number
  default = 1024
}

variable "memory" {
  type    = number
  default = 2048
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "create_vpc" {
  type    = bool
  default = true
}

variable "vpc_id" {
  type    = string
  default = ""
}

variable "public_subnet_ids" {
  type    = list(string)
  default = []
}

variable "private_subnet_ids" {
  type    = list(string)
  default = []
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.0.0/24", "10.0.1.0/24"]
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_max_allocated_storage" {
  type    = number
  default = 100
}

variable "db_name" {
  type    = string
  default = "inboxzero"
}

variable "db_username" {
  type    = string
  default = "inboxzero"
}

variable "enable_redis" {
  type    = bool
  default = true
}

variable "redis_instance_class" {
  type    = string
  default = "cache.t4g.micro"
}

variable "google_client_id" {
  type = string

  validation {
    condition     = var.google_client_id != ""
    error_message = "google_client_id is required."
  }
}

variable "google_client_secret" {
  type = string

  validation {
    condition     = var.google_client_secret != ""
    error_message = "google_client_secret is required."
  }
}

variable "google_pubsub_topic_name" {
  type = string

  validation {
    condition     = var.google_pubsub_topic_name != ""
    error_message = "google_pubsub_topic_name is required."
  }
}

variable "default_llm_provider" {
  type = string

  validation {
    condition     = var.default_llm_provider != ""
    error_message = "default_llm_provider is required."
  }
}

variable "default_llm_model" {
  type    = string
  default = ""
}

variable "llm_api_key" {
  type    = string
  default = ""
}

variable "bedrock_access_key" {
  type    = string
  default = ""
}

variable "bedrock_secret_key" {
  type    = string
  default = ""
}

variable "bedrock_region" {
  type    = string
  default = ""
}

variable "ollama_base_url" {
  type    = string
  default = ""
}

variable "ollama_model" {
  type    = string
  default = ""
}

variable "openai_compatible_base_url" {
  type    = string
  default = ""
}

variable "openai_compatible_model" {
  type    = string
  default = ""
}

variable "microsoft_client_id" {
  type    = string
  default = ""
}

variable "microsoft_client_secret" {
  type    = string
  default = ""
}
`;

const TERRAFORM_OUTPUTS_TF = `output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "service_url" {
  value = local.base_url
}

output "database_endpoint" {
  value = aws_db_instance.main.address
}

output "redis_endpoint" {
  value = var.enable_redis ? aws_elasticache_replication_group.main[0].primary_endpoint_address : ""
}

output "google_pubsub_verification_token_ssm_path" {
  value = "/\${var.app_name}/\${var.environment}/secrets/GOOGLE_PUBSUB_VERIFICATION_TOKEN"
}

output "ssm_prefix" {
  value = local.ssm_prefix
}
`;

const TERRAFORM_README_MD = `# Inbox Zero Terraform (AWS)

This directory contains Terraform configuration to deploy Inbox Zero on AWS using ECS Fargate, RDS, and optional ElastiCache Redis.

## Quick Start

\`\`\`bash
terraform init
terraform apply
\`\`\`

After apply, get the service URL:

\`\`\`bash
terraform output service_url
\`\`\`

## Variables

Values are in \`terraform.tfvars\`. Secrets are stored in AWS SSM Parameter Store and wired into the ECS task definition.

If you do not provide \`base_url\`, Terraform will use the ALB DNS name. For HTTPS and custom domains, set:

- \`domain_name\` (e.g. \`app.example.com\`)
- \`acm_certificate_arn\`
- \`route53_zone_id\` (optional, for DNS record)

## Notes

- Database migrations run automatically on container startup.
- \`terraform.tfvars\` contains secrets and should not be committed.
`;

const TERRAFORM_GITIGNORE = `.terraform/
*.tfstate
*.tfstate.*
crash.log
crash.*.log
*.tfvars
`;
