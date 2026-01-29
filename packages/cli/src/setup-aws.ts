import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { generateSecret } from "./utils";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface AwsPrerequisites {
  awsCliInstalled: boolean;
  copilotInstalled: boolean;
  profile: string | null;
  region: string | null;
}

interface GcloudPrerequisites {
  installed: boolean;
  authenticated: boolean;
  projectId: string | null;
}

export interface AwsSetupOptions {
  profile?: string;
  region?: string;
  environment?: string;
  yes?: boolean; // Non-interactive mode with defaults
  importVpcId?: string;
  importPublicSubnets?: string;
  importPrivateSubnets?: string;
  importCertArns?: string;
}

interface SecretConfig {
  name: string;
  value: string;
}

interface VpcImportConfig {
  vpcId: string;
  publicSubnets: string[];
  privateSubnets: string[];
  certArns?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const RDS_INSTANCE_OPTIONS = [
  {
    value: "db.t3.micro",
    label: "db.t3.micro  (~$12/mo)",
    hint: "1 vCPU, 1GB RAM - good for 1-5 users",
  },
  {
    value: "db.t3.small",
    label: "db.t3.small  (~$24/mo)",
    hint: "2 vCPU, 2GB RAM - good for 5-20 users",
  },
  {
    value: "db.t3.medium",
    label: "db.t3.medium (~$48/mo)",
    hint: "2 vCPU, 4GB RAM - good for 20-100 users",
  },
  {
    value: "db.t3.large",
    label: "db.t3.large  (~$96/mo)",
    hint: "2 vCPU, 8GB RAM - good for 100+ users",
  },
];

const REDIS_INSTANCE_OPTIONS = [
  {
    value: "cache.t4g.micro",
    label: "cache.t4g.micro  (~$12/mo)",
    hint: "0.5 GiB - good for <100 users",
  },
  {
    value: "cache.t4g.small",
    label: "cache.t4g.small  (~$24/mo)",
    hint: "1.37 GiB - good for 100-500 users",
  },
  {
    value: "cache.t4g.medium",
    label: "cache.t4g.medium (~$48/mo)",
    hint: "3.09 GiB - good for 500+ users",
  },
];

const APP_NAME = "inbox-zero";
const SERVICE_NAME = "inbox-zero-ecs";

// ═══════════════════════════════════════════════════════════════════════════
// Main Setup Function
// ═══════════════════════════════════════════════════════════════════════════

export async function runAwsSetup(options: AwsSetupOptions) {
  p.intro("AWS Copilot Setup for Inbox Zero");

  const nonInteractive = options.yes === true;
  if (nonInteractive) {
    p.log.info("Running in non-interactive mode with defaults");
  }

  // Cleanup any leftover files from a previous interrupted run
  cleanupInterruptedRun();

  const workspaceDir = getCopilotWorkspaceDir();
  if (workspaceDir && workspaceDir !== process.cwd()) {
    p.log.info(`Using Copilot workspace: ${workspaceDir}`);
    process.chdir(workspaceDir);
  }

  // Step 1: Check AWS prerequisites
  const spinner = p.spinner();
  spinner.start("Checking prerequisites...");

  const awsPrereqs = checkAwsPrerequisites();

  if (!awsPrereqs.awsCliInstalled) {
    spinner.stop("AWS CLI not found");
    p.log.error(
      "The AWS CLI is not installed.\n" +
        "Please install it from: https://aws.amazon.com/cli/\n" +
        "After installation, run: aws configure",
    );
    process.exit(1);
  }

  if (!awsPrereqs.copilotInstalled) {
    spinner.stop("AWS Copilot CLI not found");
    p.log.error(
      "The AWS Copilot CLI is not installed.\n" +
        "Please install it from: https://aws.github.io/copilot-cli/docs/getting-started/install/",
    );
    process.exit(1);
  }

  // Check if gcloud is available for integrated setup
  const gcloudPrereqs = checkGcloudPrerequisites();
  const gcloudAvailable =
    gcloudPrereqs.installed && gcloudPrereqs.authenticated;

  spinner.stop("Prerequisites checked");

  p.log.success("AWS CLI installed");
  p.log.success("Copilot CLI installed");
  if (gcloudAvailable) {
    p.log.success("gcloud CLI configured");
  } else {
    p.log.warn(
      "gcloud CLI not configured - you'll need to run 'inbox-zero setup-google' separately",
    );
  }

  // Step 2: Get AWS profile
  let profile = options.profile;

  if (!profile) {
    const availableProfiles = getAwsProfiles();

    if (availableProfiles.length === 0) {
      p.log.error(
        "No AWS profiles found. Please configure AWS credentials first:\n" +
          "  aws configure --profile inbox-zero",
      );
      process.exit(1);
    }

    if (availableProfiles.length === 1 || nonInteractive) {
      // Use first profile (usually "default") in non-interactive mode
      profile = availableProfiles.includes("default")
        ? "default"
        : availableProfiles[0];
      p.log.info(`Using AWS profile: ${profile}`);
    } else {
      const profileChoice = await p.select({
        message: "Select AWS profile:",
        options: availableProfiles.map((pr) => ({
          value: pr,
          label: pr,
          hint: pr === "default" ? "default profile" : undefined,
        })),
      });

      if (p.isCancel(profileChoice)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      profile = profileChoice as string;
    }
  } else {
    p.log.info(`Using AWS profile: ${profile}`);
  }

  // Validate the profile works
  spinner.start("Validating AWS credentials...");
  const credentialsValid = validateAwsCredentials(profile);
  if (!credentialsValid) {
    spinner.stop("Invalid AWS credentials");
    p.log.error(
      `Could not validate credentials for profile '${profile}'.\n` +
        "Please ensure:\n" +
        "1. You're using an IAM user (not root account)\n" +
        "2. The credentials are correctly configured\n" +
        "3. Run: aws configure --profile " +
        profile,
    );
    process.exit(1);
  }
  spinner.stop("AWS credentials validated");

  // Step 3: Get AWS region
  let region =
    options.region || awsPrereqs.region || getRegionForProfile(profile);

  if (!region) {
    if (nonInteractive) {
      region = "us-east-1";
      p.log.info(`Using region: ${region}`);
    } else {
      const regionInput = await p.text({
        message: "AWS Region:",
        placeholder: "us-east-1",
        initialValue: "us-east-1",
      });

      if (p.isCancel(regionInput)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      region = regionInput || "us-east-1";
    }
  } else {
    p.log.info(`Using region: ${region}`);
  }

  // Step 4: Get environment name
  let envName = options.environment;

  if (!envName) {
    if (nonInteractive) {
      envName = "production";
      p.log.info(`Using environment: ${envName}`);
    } else {
      const envInput = await p.text({
        message: "Environment name (e.g., production, staging, dev):",
        placeholder: "production",
        initialValue: "production",
        validate: (v) => {
          if (!v) return "Environment name is required";
          if (!/^[a-z][a-z0-9-]*$/.test(v)) {
            return "Must start with a letter and contain only lowercase letters, numbers, and hyphens";
          }
          return undefined;
        },
      });

      if (p.isCancel(envInput)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      envName = envInput;
    }
  }

  // Step 5: Existing VPC import (optional)
  let vpcImport: VpcImportConfig | null = null;
  const flagVpcId = options.importVpcId?.trim();
  const flagPublicSubnets = parseCsvList(options.importPublicSubnets);
  const flagPrivateSubnets = parseCsvList(options.importPrivateSubnets);
  const flagCertArns = parseCsvList(options.importCertArns);
  const hasVpcFlags =
    !!flagVpcId ||
    flagPublicSubnets.length > 0 ||
    flagPrivateSubnets.length > 0 ||
    flagCertArns.length > 0;

  if (hasVpcFlags) {
    if (
      !flagVpcId ||
      flagPublicSubnets.length === 0 ||
      flagPrivateSubnets.length === 0
    ) {
      p.log.error(
        "Using an existing VPC requires --import-vpc-id, --import-public-subnets, and --import-private-subnets.",
      );
      process.exit(1);
    }
    vpcImport = {
      vpcId: flagVpcId,
      publicSubnets: flagPublicSubnets,
      privateSubnets: flagPrivateSubnets,
      certArns: flagCertArns.length ? flagCertArns : undefined,
    };
    p.log.info(`Using existing VPC: ${vpcImport.vpcId}`);
  } else if (!nonInteractive) {
    const useExistingVpc = await p.confirm({
      message: "Use an existing VPC?",
      initialValue: false,
    });

    if (p.isCancel(useExistingVpc)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (useExistingVpc) {
      const vpcInput = await p.text({
        message: "VPC ID:",
        placeholder: "vpc-xxxxxxxx",
        validate: (v) => (v ? undefined : "VPC ID is required"),
      });

      if (p.isCancel(vpcInput)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      const publicInput = await p.text({
        message: "Public subnet IDs (comma-separated):",
        placeholder: "subnet-aaa,subnet-bbb",
        validate: (v) => (v ? undefined : "Public subnets are required"),
      });

      if (p.isCancel(publicInput)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      const privateInput = await p.text({
        message: "Private subnet IDs (comma-separated):",
        placeholder: "subnet-ccc,subnet-ddd",
        validate: (v) => (v ? undefined : "Private subnets are required"),
      });

      if (p.isCancel(privateInput)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      const certInput = await p.text({
        message:
          "ACM cert ARNs for the public ALB (optional, comma-separated):",
        placeholder: "arn:aws:acm:region:account:certificate/...",
      });

      if (p.isCancel(certInput)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      const publicSubnets = parseCsvList(publicInput);
      const privateSubnets = parseCsvList(privateInput);
      const certArns = parseCsvList(certInput);

      vpcImport = {
        vpcId: vpcInput,
        publicSubnets,
        privateSubnets,
        certArns: certArns.length ? certArns : undefined,
      };

      if (vpcImport.publicSubnets.length < 2) {
        p.log.warn("Copilot recommends at least 2 public subnets.");
      }
      if (vpcImport.privateSubnets.length < 2) {
        p.log.warn("Copilot recommends at least 2 private subnets.");
      }
    }
  }

  // Step 6: Select RDS instance size
  let rdsSize: string;
  if (nonInteractive) {
    rdsSize = "db.t3.micro";
    p.log.info(`Using RDS instance: ${rdsSize}`);
  } else {
    const rdsSizeChoice = await p.select({
      message: "Select RDS PostgreSQL instance size:",
      options: RDS_INSTANCE_OPTIONS,
    });

    if (p.isCancel(rdsSizeChoice)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    rdsSize = rdsSizeChoice as string;
  }

  // Step 7: Get domain (optional)
  let domain: string | undefined;
  if (nonInteractive) {
    domain = undefined;
    p.log.info("Domain: (none)");
  } else {
    const domainInput = await p.text({
      message: "Domain for your app (optional, press Enter to skip):",
      placeholder: "app.example.com",
    });

    if (p.isCancel(domainInput)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    domain = domainInput || undefined;
  }

  // Step 8: Ask about webhook gateway (for firewalled deployments)
  let useWebhookGateway: boolean;
  if (nonInteractive) {
    useWebhookGateway = false;
    p.log.info("Webhook gateway: No");
  } else {
    const webhookChoice = await p.confirm({
      message: "Enable webhook gateway for firewalled deployment?",
      initialValue: false,
    });

    if (p.isCancel(webhookChoice)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    useWebhookGateway = webhookChoice;
  }

  // Step 8.5: Ask about Redis (for subscriptions/real-time features)
  let enableRedis: boolean;
  let redisSize: string;

  if (nonInteractive) {
    enableRedis = true;
    redisSize = "cache.t4g.micro";
    p.log.info(`Redis: Yes (${redisSize})`);
  } else {
    const redisChoice = await p.confirm({
      message: "Enable Redis for real-time features?",
      initialValue: true,
    });

    if (p.isCancel(redisChoice)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    enableRedis = redisChoice;

    if (enableRedis) {
      const redisSizeChoice = await p.select({
        message: "Select Redis instance size:",
        options: REDIS_INSTANCE_OPTIONS,
      });

      if (p.isCancel(redisSizeChoice)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }
      redisSize = redisSizeChoice as string;
    } else {
      redisSize = "";
    }
  }

  // Step 9: Google OAuth credentials (required)
  let configureGoogle = false;
  let googleConfig: { projectId: string } | null = null;
  let googleOAuth: { clientId: string; clientSecret: string } | null = null;

  if (nonInteractive) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      p.log.error(
        "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.\n" +
          "In non-interactive mode, set these env vars before running:\n" +
          "GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... inbox-zero setup-aws --yes",
      );
      process.exit(1);
    }
    googleOAuth = { clientId, clientSecret };
  } else {
    p.note(
      "Google OAuth credentials are required for the app to start.\n" +
        "Create them at: https://console.cloud.google.com/apis/credentials",
      "Google OAuth Required",
    );

    const oauthInput = await p.group(
      {
        clientId: () =>
          p.text({
            message: "Google Client ID:",
            placeholder: "123456789012-abc.apps.googleusercontent.com",
            validate: (v) => (v ? undefined : "Client ID is required"),
          }),
        clientSecret: () =>
          p.text({
            message: "Google Client Secret:",
            placeholder: "GOCSPX-...",
            validate: (v) => (v ? undefined : "Client Secret is required"),
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    googleOAuth = {
      clientId: oauthInput.clientId,
      clientSecret: oauthInput.clientSecret,
    };
  }

  // Step 10: Ask about Google Cloud integration if gcloud is available
  if (gcloudAvailable && !nonInteractive) {
    const integrateGoogle = await p.confirm({
      message: "gcloud detected. Configure Google Cloud in the same flow?",
      initialValue: true,
    });

    if (!p.isCancel(integrateGoogle) && integrateGoogle) {
      configureGoogle = true;

      // Get Google project ID
      let projectId = gcloudPrereqs.projectId;
      if (!projectId) {
        const projectInput = await p.text({
          message: "Google Cloud project ID:",
          placeholder: "my-project-123",
          validate: (v) => (v ? undefined : "Project ID is required"),
        });

        if (p.isCancel(projectInput)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }

        projectId = projectInput;
      } else {
        p.log.info(`Using Google Cloud project: ${projectId}`);
      }

      googleConfig = { projectId };
    }
  } else if (nonInteractive) {
    p.log.info("Google integration: Skipped (non-interactive mode)");
  }

  // Step 11: Select LLM provider
  let llmProvider: string;
  let llmApiKey = "";
  let llmEnvVar = "";

  if (nonInteractive) {
    // Use Bedrock as default since it uses AWS credentials (no API key needed)
    llmProvider = "bedrock";
    llmEnvVar = "BEDROCK_REGION";
    llmApiKey = region;
    p.log.info("LLM provider: AWS Bedrock (uses AWS credentials)");
  } else {
    const llmChoice = await p.select({
      message: "LLM Provider:",
      options: [
        { value: "anthropic", label: "Anthropic (Claude)" },
        { value: "openai", label: "OpenAI (GPT)" },
        { value: "google", label: "Google (Gemini)" },
        {
          value: "openrouter",
          label: "OpenRouter",
          hint: "access multiple models",
        },
        {
          value: "aigateway",
          label: "Vercel AI Gateway",
          hint: "access multiple models",
        },
        { value: "bedrock", label: "AWS Bedrock" },
        { value: "groq", label: "Groq", hint: "fast inference" },
      ],
    });

    if (p.isCancel(llmChoice)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    llmProvider = llmChoice as string;

    // Get LLM API key
    if (llmProvider === "bedrock") {
      p.log.info(
        "Bedrock uses AWS credentials. Make sure your IAM user has Bedrock access.",
      );
      llmEnvVar = "BEDROCK_REGION";
      llmApiKey = region;
    } else {
      const apiKeyMap: Record<string, { envVar: string; url: string }> = {
        anthropic: {
          envVar: "ANTHROPIC_API_KEY",
          url: "https://console.anthropic.com/settings/keys",
        },
        openai: {
          envVar: "OPENAI_API_KEY",
          url: "https://platform.openai.com/api-keys",
        },
        google: {
          envVar: "GOOGLE_API_KEY",
          url: "https://aistudio.google.com/apikey",
        },
        openrouter: {
          envVar: "OPENROUTER_API_KEY",
          url: "https://openrouter.ai/settings/keys",
        },
        aigateway: {
          envVar: "AI_GATEWAY_API_KEY",
          url: "https://vercel.com/docs/ai-gateway",
        },
        groq: {
          envVar: "GROQ_API_KEY",
          url: "https://console.groq.com/keys",
        },
      };

      const { envVar, url } = apiKeyMap[llmProvider];
      llmEnvVar = envVar;

      p.log.info(`Get your API key at: ${url}`);

      const apiKeyInput = await p.text({
        message: `${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)} API Key:`,
        placeholder: "sk-...",
        validate: (v) => (v ? undefined : "API key is required"),
      });

      if (p.isCancel(apiKeyInput)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      llmApiKey = apiKeyInput;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Begin Deployment
  // ═══════════════════════════════════════════════════════════════════════════

  p.note(
    `Configuration Summary:
• AWS Profile: ${profile}
• AWS Region: ${region}
• Environment: ${envName}
• VPC: ${vpcImport ? `Existing (${vpcImport.vpcId})` : "Copilot-managed"}
• RDS Instance: ${rdsSize}
• Redis: ${enableRedis ? `Yes (${redisSize})` : "No"}
• Domain: ${domain || "(none)"}
• Webhook Gateway: ${useWebhookGateway ? "Yes" : "No"}
• Google Integration: ${configureGoogle ? "Yes" : "No"}
• LLM Provider: ${llmProvider}`,
    "Ready to Deploy",
  );

  if (!nonInteractive) {
    const confirmDeploy = await p.confirm({
      message: "Proceed with deployment? This will create AWS resources.",
      initialValue: true,
    });

    if (p.isCancel(confirmDeploy) || !confirmDeploy) {
      p.cancel("Deployment cancelled.");
      process.exit(0);
    }
  } else {
    p.log.info("Proceeding with deployment (non-interactive mode)...");
  }

  // Set environment variables for all subsequent commands
  const env = {
    ...process.env,
    AWS_PROFILE: profile,
    AWS_REGION: region,
    AWS_DEFAULT_REGION: region,
  };

  // Step 12: Update addons.parameters.yml with RDS and Redis configuration
  spinner.start("Updating infrastructure configuration...");
  updateAddonsParameters({
    rdsInstanceClass: rdsSize as string,
    enableRedis,
    redisInstanceClass: redisSize,
  });
  spinner.stop("Infrastructure configuration updated");

  // Step 13: Generate and store secrets in SSM
  spinner.start("Generating secrets...");

  const secrets: SecretConfig[] = [
    { name: "AUTH_SECRET", value: generateSecret(32) },
    { name: "EMAIL_ENCRYPT_SECRET", value: generateSecret(32) },
    { name: "EMAIL_ENCRYPT_SALT", value: generateSecret(16) },
    { name: "INTERNAL_API_KEY", value: generateSecret(32) },
    { name: "CRON_SECRET", value: generateSecret(32) },
    { name: "GOOGLE_PUBSUB_VERIFICATION_TOKEN", value: generateSecret(32) },
  ];

  // Add Google OAuth secrets (required)
  if (googleOAuth) {
    secrets.push(
      { name: "GOOGLE_CLIENT_ID", value: googleOAuth.clientId },
      { name: "GOOGLE_CLIENT_SECRET", value: googleOAuth.clientSecret },
    );
  }

  const pubsubTopicName =
    process.env.GOOGLE_PUBSUB_TOPIC_NAME ||
    (googleConfig?.projectId
      ? `projects/${googleConfig.projectId}/topics/inbox-zero-emails`
      : "projects/your-project-id/topics/inbox-zero-emails");
  secrets.push({ name: "GOOGLE_PUBSUB_TOPIC_NAME", value: pubsubTopicName });

  // Add LLM API key
  if (llmEnvVar && llmApiKey) {
    secrets.push({ name: llmEnvVar, value: llmApiKey });
  }

  spinner.stop("Secrets generated");

  // Step 14: Initialize Copilot app (if not already done)
  spinner.start("Initializing Copilot application...");

  const appInitResult = initCopilotApp(domain, env);
  if (!appInitResult.success) {
    spinner.stop("Failed to initialize app");
    p.log.error(appInitResult.error || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Copilot application initialized");

  // Step 15: Initialize environment
  spinner.start(`Initializing ${envName} environment...`);

  const envInitResult = initCopilotEnv(envName, profile, env, vpcImport);
  if (!envInitResult.success) {
    spinner.stop("Failed to initialize environment");
    p.log.error(envInitResult.error || "Unknown error");
    process.exit(1);
  }

  spinner.stop(`${envName} environment initialized`);

  // Step 16: Store secrets in SSM
  spinner.start("Storing secrets in AWS SSM...");

  for (const secret of secrets) {
    const ssmResult = storeSecretInSsm(secret.name, secret.value, envName, env);
    if (!ssmResult.success) {
      spinner.stop(`Failed to store secret: ${secret.name}`);
      p.log.error(ssmResult.error || "Unknown error");
      // Continue with other secrets
    }
  }

  spinner.stop("Secrets stored in SSM");

  // Step 17: Webhook gateway is stored in templates/ and only copied to addons/ when needed
  // This avoids the chicken-and-egg problem (webhook gateway needs HTTPS listener from service)
  // We'll copy it after the service is deployed if the user wants it

  // Step 18: Deploy environment (creates VPC, RDS)
  spinner.start(
    `Deploying ${envName} environment (this may take 10-15 minutes)...`,
  );

  let envDeployResult = deployCopilotEnv(envName, env);

  // Check for orphaned environment registration (role doesn't exist but registration does)
  if (
    !envDeployResult.success &&
    envDeployResult.error?.includes("not authorized to perform: sts:AssumeRole")
  ) {
    spinner.stop("Detected orphaned environment registration");
    p.log.warn(
      "Found stale environment registration from a previous failed deployment.",
    );
    p.log.info("Cleaning up and retrying...");

    const cleaned = cleanupOrphanedEnvironment(APP_NAME, envName, env);
    if (cleaned) {
      // Also delete local workspace file to re-register
      const copilotRoot = findCopilotRoot();
      if (copilotRoot) {
        const workspacePath = resolve(copilotRoot, ".workspace");
        if (existsSync(workspacePath)) {
          spawnSync("rm", [workspacePath]);
        }
        // Also remove the local env directory
        const envDir = resolve(copilotRoot, "environments", envName);
        if (existsSync(envDir)) {
          spawnSync("rm", ["-rf", envDir]);
        }
      }

      // Re-init app first (workspace was deleted)
      spinner.start("Re-initializing application...");
      initCopilotApp(domain, env);
      spinner.stop("Application re-initialized");

      // Re-init environment
      spinner.start("Re-initializing environment...");
      initCopilotEnv(envName, profile, env);
      spinner.stop("Environment re-initialized");

      spinner.start(
        `Deploying ${envName} environment (this may take 10-15 minutes)...`,
      );
      envDeployResult = deployCopilotEnv(envName, env);
    }
  }

  if (!envDeployResult.success) {
    spinner.stop("Failed to deploy environment");
    p.log.error(envDeployResult.error || "Unknown error");
    p.note(
      `Common issues:
• CloudFormation stack in ROLLBACK state (delete via AWS Console)
• IAM permission issues (ensure using IAM user, not root)
• Network/timeout issues (retry the command)`,
      "Troubleshooting",
    );
    process.exit(1);
  }

  spinner.stop(`${envName} environment deployed`);

  // Step 18.25: Validate database URL parameters
  spinner.start("Validating database URL parameters...");
  const dbUrlResult = normalizeDatabaseUrlParameters(envName, env);
  if (!dbUrlResult.success) {
    spinner.stop("Database URL validation failed");
    p.log.warn(dbUrlResult.error || "Unable to validate database URL");
  } else {
    spinner.stop("Database URL parameters validated");
  }

  // Step 18.5: Update service manifest with dynamic secrets
  spinner.start("Updating service manifest with secrets...");
  updateServiceManifestSecrets({
    llmEnvVar,
    hasGoogleOAuth: !!googleOAuth,
    enableRedis,
  });
  spinner.stop("Service manifest updated");

  // Step 18.6: Update service manifest variables (base URL + LLM provider)
  const initialBaseUrl = domain ? `https://${domain}` : "http://localhost";
  spinner.start("Updating service manifest variables...");
  updateServiceManifestVariables({
    baseUrl: initialBaseUrl,
    llmProvider,
  });
  spinner.stop("Service manifest variables updated");

  // Step 18.7: Update service manifest HTTP config (domain/redirect)
  spinner.start("Updating service manifest HTTP settings...");
  updateServiceManifestHttp({ domain });
  spinner.stop("Service manifest HTTP settings updated");

  // Step 19: Initialize and deploy service
  spinner.start("Initializing service...");

  const svcInitResult = initCopilotService(env);
  if (!svcInitResult.success) {
    spinner.stop("Failed to initialize service");
    p.log.error(svcInitResult.error || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Service initialized");

  spinner.start("Deploying service (this may take 5-10 minutes)...");

  const svcDeployResult = deployCopilotService(envName, env);
  if (!svcDeployResult.success) {
    spinner.stop("Failed to deploy service");
    p.log.error(svcDeployResult.error || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Service deployed");

  // Step 19.5: Update base URL from service endpoint if no domain
  if (!domain) {
    const serviceUrl = getServiceUrl(envName, env);
    if (serviceUrl) {
      spinner.start("Updating base URL to service endpoint...");
      updateServiceManifestVariables({
        baseUrl: serviceUrl,
        llmProvider,
      });
      spinner.stop("Base URL updated");

      spinner.start("Redeploying service with updated base URL...");
      const baseUrlDeployResult = deployCopilotService(envName, env);
      if (!baseUrlDeployResult.success) {
        spinner.stop("Failed to redeploy service with base URL");
        p.log.error(baseUrlDeployResult.error || "Unknown error");
        process.exit(1);
      }
      spinner.stop("Service redeployed with updated base URL");

      resetServiceManifestVariables();
    }
  }

  // Step 20: Deploy webhook gateway addon (only if user requested it)
  let webhookUrl = "";
  if (useWebhookGateway) {
    spinner.start("Adding webhook gateway addon...");

    const copilotRoot = findCopilotRoot();
    const addonsPath = findAddonsPath();

    if (copilotRoot && addonsPath) {
      // Copy webhook-gateway.yml from templates to addons
      const templatePath = resolve(
        copilotRoot,
        "templates",
        "webhook-gateway.yml",
      );
      const addonPath = resolve(addonsPath, "webhook-gateway.yml");

      if (existsSync(templatePath)) {
        const content = readFileSync(templatePath, "utf-8");
        writeFileSync(addonPath, content);

        // Add webhook gateway parameters to addons.parameters.yml
        const paramsPath = resolve(addonsPath, "addons.parameters.yml");
        if (existsSync(paramsPath)) {
          let paramsContent = readFileSync(paramsPath, "utf-8");
          const listenerProtocol = domain ? "HTTPS" : "HTTP";
          if (!paramsContent.includes("WebhookAudience:")) {
            paramsContent = `${paramsContent.trimEnd()}\n\n  # Webhook gateway params (auto-added)\n  WebhookAudience: ''\n  WebhookListenerProtocol: '${listenerProtocol}'\n`;
          } else if (!paramsContent.includes("WebhookListenerProtocol:")) {
            paramsContent = `${paramsContent.trimEnd()}\n  WebhookListenerProtocol: '${listenerProtocol}'\n`;
          } else {
            paramsContent = paramsContent.replace(
              /WebhookListenerProtocol:\s*['"]?[^'\n]*['"]?/,
              `WebhookListenerProtocol: '${listenerProtocol}'`,
            );
          }
          writeFileSync(paramsPath, paramsContent);
        }

        spinner.stop("Webhook gateway addon added");

        // Redeploy environment to include webhook gateway
        spinner.start(
          "Deploying webhook gateway (this may take a few minutes)...",
        );
        const webhookDeployResult = deployCopilotEnv(envName, env);
        if (!webhookDeployResult.success) {
          spinner.stop("Failed to deploy webhook gateway");
          p.log.error(webhookDeployResult.error || "Unknown error");
          // Clean up - remove the addon so it doesn't fail next time
          spawnSync("rm", [addonPath]);
          // Remove the parameters we added
          if (existsSync(paramsPath)) {
            let paramsContent = readFileSync(paramsPath, "utf-8");
            paramsContent = paramsContent.replace(
              /\n\n\s+# Webhook gateway params \(auto-added\)\n\s+WebhookAudience: ''\n\s+WebhookListenerProtocol: '[^']+'\n?/,
              "",
            );
            writeFileSync(paramsPath, paramsContent);
          }
        } else {
          spinner.stop("Webhook gateway deployed");
          // Get the webhook URL from CloudFormation outputs
          webhookUrl = getWebhookUrl(envName, env);
        }
      } else {
        spinner.stop("Webhook gateway template not found");
        p.log.warn(
          `Template not found at ${templatePath}.\n` +
            "You can manually add the webhook gateway later.",
        );
      }
    }
  }

  // Step 21: Configure Google Pub/Sub if integrated
  if (configureGoogle && googleConfig && webhookUrl) {
    spinner.start("Configuring Google Cloud Pub/Sub...");

    const pubsubResult = setupGooglePubSub(
      googleConfig.projectId,
      webhookUrl,
      domain || "inbox-zero",
    );

    if (!pubsubResult.success) {
      spinner.stop("Failed to configure Pub/Sub");
      p.log.warn(
        "Pub/Sub setup failed. You can configure it manually:\n" +
          `inbox-zero setup-google --webhook-url "${webhookUrl}"`,
      );
    } else {
      spinner.stop("Google Pub/Sub configured");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  const appUrl = domain
    ? `https://${domain}`
    : "(check Copilot output for URL)";

  const summary = [
    `✓ RDS PostgreSQL (${rdsSize}) deployed`,
    enableRedis
      ? `✓ ElastiCache Redis (${redisSize}) deployed`
      : "✗ Redis (not enabled)",
    "✓ Secrets stored in SSM",
    "✓ ECS service deployed",
    useWebhookGateway && webhookUrl
      ? `✓ Webhook gateway: ${webhookUrl}`
      : useWebhookGateway
        ? "! Webhook gateway deployment needs attention"
        : "✗ Webhook gateway (not enabled)",
    configureGoogle && webhookUrl
      ? "✓ Google Pub/Sub configured"
      : configureGoogle
        ? "! Google Pub/Sub needs manual setup"
        : "✗ Google integration (not configured)",
  ].join("\n");

  p.note(summary, "Deployment Complete");

  // Next steps
  const nextSteps: string[] = [];

  if (!configureGoogle) {
    nextSteps.push(
      `Run Google setup:\n  inbox-zero setup-google${webhookUrl ? ` --webhook-url "${webhookUrl}"` : ""}`,
    );
  }

  if (!domain) {
    nextSteps.push(
      "Get your app URL:\n  copilot svc show --name inbox-zero-ecs",
    );
  }

  nextSteps.push(
    "View logs:\n  copilot svc logs --follow",
    "Check status:\n  copilot svc status",
  );

  p.note(nextSteps.join("\n\n"), "Next Steps");

  p.outro(`App URL: ${appUrl}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function checkAwsPrerequisites(): AwsPrerequisites {
  // Check AWS CLI
  const awsResult = spawnSync("aws", ["--version"], { stdio: "pipe" });
  const awsCliInstalled = awsResult.status === 0;

  // Check Copilot CLI
  const copilotResult = spawnSync("copilot", ["--version"], { stdio: "pipe" });
  const copilotInstalled = copilotResult.status === 0;

  // Get current profile
  const profile = process.env.AWS_PROFILE || null;

  // Get current region
  let region = null;
  if (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION) {
    region = (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION)?.trim();
  }
  if (!region) {
    const regionResult = profile
      ? spawnSync("aws", ["configure", "get", "region", "--profile", profile], {
          stdio: "pipe",
        })
      : spawnSync("aws", ["configure", "get", "region"], { stdio: "pipe" });
    region =
      regionResult.status === 0
        ? regionResult.stdout.toString().trim() || null
        : null;
  }

  return { awsCliInstalled, copilotInstalled, profile, region };
}

function getRegionForProfile(profile: string): string | null {
  const envRegion =
    process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim();
  if (envRegion) return envRegion;

  const result = spawnSync(
    "aws",
    ["configure", "get", "region", "--profile", profile],
    { stdio: "pipe" },
  );
  if (result.status !== 0) return null;
  return result.stdout.toString().trim() || null;
}

function checkGcloudPrerequisites(): GcloudPrerequisites {
  // Check if gcloud is installed
  const versionResult = spawnSync("gcloud", ["--version"], { stdio: "pipe" });
  if (versionResult.status !== 0) {
    return { installed: false, authenticated: false, projectId: null };
  }

  // Check authentication
  const authResult = spawnSync("gcloud", ["auth", "list", "--format=json"], {
    stdio: "pipe",
  });
  let authenticated = false;
  if (authResult.status === 0) {
    try {
      const accounts = JSON.parse(authResult.stdout.toString());
      authenticated = Array.isArray(accounts) && accounts.length > 0;
    } catch {
      authenticated = false;
    }
  }

  // Get current project ID
  const projectResult = spawnSync(
    "gcloud",
    ["config", "get-value", "project"],
    { stdio: "pipe" },
  );
  const projectId =
    projectResult.status === 0
      ? projectResult.stdout.toString().trim() || null
      : null;

  return { installed: true, authenticated, projectId };
}

function validateAwsCredentials(profile: string): boolean {
  const result = spawnSync(
    "aws",
    ["sts", "get-caller-identity", "--profile", profile],
    { stdio: "pipe" },
  );
  return result.status === 0;
}

function getAwsProfiles(): string[] {
  const profiles: string[] = [];
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const credentialsPath = `${homeDir}/.aws/credentials`;

  try {
    if (existsSync(credentialsPath)) {
      const content = readFileSync(credentialsPath, "utf-8");
      const matches = content.match(/^\[([^\]]+)\]/gm);
      if (matches) {
        for (const match of matches) {
          const profileName = match.slice(1, -1); // Remove [ and ]
          profiles.push(profileName);
        }
      }
    }
  } catch {
    // Ignore errors reading credentials file
  }

  // Also check config file for profiles defined there
  const configPath = `${homeDir}/.aws/config`;
  try {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const matches = content.match(/^\[profile ([^\]]+)\]/gm);
      if (matches) {
        for (const match of matches) {
          const profileName = match.replace("[profile ", "").slice(0, -1);
          if (!profiles.includes(profileName)) {
            profiles.push(profileName);
          }
        }
      }
    }
  } catch {
    // Ignore errors reading config file
  }

  return profiles;
}

function cleanupInterruptedRun(): void {
  const addonsPath = findAddonsPath();
  if (!addonsPath) return;

  // Clean up any leftover .bak or .disabled files from old runs
  const webhookGatewayBackup = resolve(addonsPath, "webhook-gateway.yml.bak");
  const webhookGatewayDisabled = resolve(
    addonsPath,
    "webhook-gateway.yml.disabled",
  );

  if (existsSync(webhookGatewayBackup)) {
    spawnSync("rm", [webhookGatewayBackup]);
  }
  if (existsSync(webhookGatewayDisabled)) {
    spawnSync("rm", [webhookGatewayDisabled]);
  }
}

function cleanupOrphanedEnvironment(
  appName: string,
  envName: string,
  env: NodeJS.ProcessEnv,
): boolean {
  // Check if there's an orphaned environment registration in SSM
  // This happens when env init succeeds but env deploy fails, leaving a stale registration
  const checkResult = spawnSync(
    "aws",
    [
      "ssm",
      "get-parameter",
      "--name",
      `/copilot/applications/${appName}/environments/${envName}`,
      "--query",
      "Parameter.Value",
      "--output",
      "text",
    ],
    { stdio: "pipe", env },
  );

  // Delete the SSM registration if it exists
  if (checkResult.status === 0) {
    spawnSync(
      "aws",
      [
        "ssm",
        "delete-parameter",
        "--name",
        `/copilot/applications/${appName}/environments/${envName}`,
      ],
      { stdio: "pipe", env },
    );
  }

  // Check if there's a stuck CloudFormation stack in ROLLBACK_COMPLETE or similar state
  const stackName = `${appName}-${envName}`;
  const stackStatusResult = spawnSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stackName,
      "--query",
      "Stacks[0].StackStatus",
      "--output",
      "text",
    ],
    { stdio: "pipe", env },
  );

  const stackStatus = stackStatusResult.stdout?.toString().trim();
  if (
    stackStatus &&
    (stackStatus.includes("ROLLBACK_COMPLETE") ||
      stackStatus.includes("DELETE_FAILED") ||
      stackStatus.includes("CREATE_FAILED"))
  ) {
    // Delete the stuck stack
    spawnSync(
      "aws",
      ["cloudformation", "delete-stack", "--stack-name", stackName],
      { stdio: "pipe", env },
    );

    // Wait for deletion (with timeout)
    spawnSync(
      "aws",
      [
        "cloudformation",
        "wait",
        "stack-delete-complete",
        "--stack-name",
        stackName,
      ],
      { stdio: "pipe", env, timeout: 300_000 },
    );
  }

  return true;
}

function findCopilotRoot(): string | null {
  const possiblePaths = [
    resolve(process.cwd(), "copilot"),
    resolve(process.cwd(), "../copilot"),
    resolve(process.cwd(), "../../copilot"),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

function getCopilotWorkspaceDir(): string | null {
  const copilotRoot = findCopilotRoot();
  if (!copilotRoot) return null;
  return resolve(copilotRoot, "..");
}

function findAddonsPath(): string | null {
  const copilotRoot = findCopilotRoot();
  if (!copilotRoot) return null;

  const addonsPath = resolve(copilotRoot, "environments/addons");
  return existsSync(addonsPath) ? addonsPath : null;
}

function updateAddonsParameters(config: {
  rdsInstanceClass: string;
  enableRedis: boolean;
  redisInstanceClass: string;
}): void {
  const addonsPath = findAddonsPath();
  if (!addonsPath) {
    return;
  }

  const paramsFile = resolve(addonsPath, "addons.parameters.yml");
  if (!existsSync(paramsFile)) {
    return;
  }

  let content = readFileSync(paramsFile, "utf-8");

  // Update or add RDSInstanceClass parameter
  if (content.includes("RDSInstanceClass:")) {
    content = content.replace(
      /RDSInstanceClass:\s*['"]?[^'\n]*['"]?/,
      `RDSInstanceClass: '${config.rdsInstanceClass}'`,
    );
  } else {
    content = `${content.trimEnd()}\n  RDSInstanceClass: '${config.rdsInstanceClass}'\n`;
  }

  // Update EnableRedis parameter
  const enableRedisValue = config.enableRedis ? "true" : "false";
  if (content.includes("EnableRedis:")) {
    content = content.replace(
      /EnableRedis:\s*['"]?[^'\n]*['"]?/,
      `EnableRedis: '${enableRedisValue}'`,
    );
  } else {
    content = `${content.trimEnd()}\n  EnableRedis: '${enableRedisValue}'\n`;
  }

  // Update RedisInstanceClass parameter
  if (config.enableRedis && config.redisInstanceClass) {
    if (content.includes("RedisInstanceClass:")) {
      content = content.replace(
        /RedisInstanceClass:\s*['"]?[^'\n]*['"]?/,
        `RedisInstanceClass: '${config.redisInstanceClass}'`,
      );
    } else {
      content = `${content.trimEnd()}\n  RedisInstanceClass: '${config.redisInstanceClass}'\n`;
    }
  }

  writeFileSync(paramsFile, content);
}

function updateServiceManifestSecrets(config: {
  llmEnvVar: string;
  hasGoogleOAuth: boolean;
  enableRedis?: boolean;
}): void {
  const copilotRoot = findCopilotRoot();
  if (!copilotRoot) return;

  const manifestPath = resolve(copilotRoot, SERVICE_NAME, "manifest.yml");
  if (!existsSync(manifestPath)) return;

  let content = readFileSync(manifestPath, "utf-8");

  const baseSecrets = [
    "AUTH_SECRET",
    "EMAIL_ENCRYPT_SECRET",
    "EMAIL_ENCRYPT_SALT",
    "INTERNAL_API_KEY",
    "CRON_SECRET",
    "GOOGLE_PUBSUB_VERIFICATION_TOKEN",
    "GOOGLE_PUBSUB_TOPIC_NAME",
    "BEDROCK_REGION",
    "DATABASE_URL",
    "DIRECT_URL",
  ];
  const optionalSecrets = [
    ...(config.llmEnvVar ? [config.llmEnvVar] : []),
    ...(config.hasGoogleOAuth
      ? ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]
      : []),
    ...(config.enableRedis ? ["REDIS_URL"] : []),
  ];

  for (const secretName of [...baseSecrets, ...optionalSecrets]) {
    content = normalizeSecretReference(content, secretName);
  }

  content = removeSecrets(content, [
    "UPSTASH_REDIS_URL",
    "UPSTASH_REDIS_TOKEN",
  ]);

  // Add LLM provider secret if not already present
  if (config.llmEnvVar && !content.includes(`${config.llmEnvVar}:`)) {
    const secretLine = `  ${config.llmEnvVar}: /copilot/\${COPILOT_APPLICATION_NAME}/\${COPILOT_ENVIRONMENT_NAME}/secrets/${config.llmEnvVar}`;
    // Add after the last secret line (before comments or end of secrets block)
    content = content.replace(
      /(secrets:[\s\S]*?)((?:\n\s+#|\n[a-z]|\n$))/,
      `$1\n${secretLine}$2`,
    );
  }

  if (!content.includes("GOOGLE_PUBSUB_TOPIC_NAME:")) {
    const pubsubSecret = `  GOOGLE_PUBSUB_TOPIC_NAME: ${getSecretReference("GOOGLE_PUBSUB_TOPIC_NAME")}`;
    content = content.replace(
      /(secrets:[\s\S]*?)((?:\n\s+#|\n[a-z]|\n$))/,
      `$1\n${pubsubSecret}$2`,
    );
  }

  // Add Google OAuth secrets if configured and not already present
  if (config.hasGoogleOAuth) {
    if (!content.includes("GOOGLE_CLIENT_ID:")) {
      const googleSecrets = `  GOOGLE_CLIENT_ID: /copilot/\${COPILOT_APPLICATION_NAME}/\${COPILOT_ENVIRONMENT_NAME}/secrets/GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET: /copilot/\${COPILOT_APPLICATION_NAME}/\${COPILOT_ENVIRONMENT_NAME}/secrets/GOOGLE_CLIENT_SECRET`;
      content = content.replace(
        /(secrets:[\s\S]*?)((?:\n\s+#|\n[a-z]|\n$))/,
        `$1\n${googleSecrets}$2`,
      );
    }
  }

  // Add Redis URL secret if enabled and not already present
  if (config.enableRedis && !content.includes("REDIS_URL:")) {
    const redisSecret = `  REDIS_URL: ${getSecretReference("REDIS_URL")}`;
    content = content.replace(
      /(secrets:[\s\S]*?)((?:\n\s+#|\n[a-z]|\n$))/,
      `$1\n${redisSecret}$2`,
    );
  }

  writeFileSync(manifestPath, content);
}

function updateServiceManifestVariables(config: {
  baseUrl: string;
  llmProvider: string;
}): void {
  const copilotRoot = findCopilotRoot();
  if (!copilotRoot) return;

  const manifestPath = resolve(copilotRoot, SERVICE_NAME, "manifest.yml");
  if (!existsSync(manifestPath)) return;

  let content = readFileSync(manifestPath, "utf-8");
  content = setManifestVariable(
    content,
    "NEXT_PUBLIC_BASE_URL",
    config.baseUrl,
  );
  content = setManifestVariable(
    content,
    "DEFAULT_LLM_PROVIDER",
    config.llmProvider,
  );
  writeFileSync(manifestPath, content);
}

function updateServiceManifestHttp(config: { domain?: string }): void {
  const copilotRoot = findCopilotRoot();
  if (!copilotRoot) return;

  const manifestPath = resolve(copilotRoot, SERVICE_NAME, "manifest.yml");
  if (!existsSync(manifestPath)) return;

  let content = readFileSync(manifestPath, "utf-8");
  content = content.replace(/^\s*#?\s*alias:.*\n?/m, "");
  content = content.replace(/^\s*#?\s*redirect_to_https:.*\n?/m, "");

  const httpBlockMatch = content.match(/http:\n\s+path: '\/'\n/);
  if (httpBlockMatch) {
    const insertLines = config.domain
      ? `  alias: ${config.domain}\n  redirect_to_https: true\n`
      : "  # alias: YOUR_DOMAIN  # Uncomment and set if using a custom domain\n  # redirect_to_https: true  # Enable when using a domain with HTTPS\n";
    content = content.replace(
      /http:\n\s+path: '\/'\n/,
      `http:\n  path: '/'\n${insertLines}`,
    );
  }

  writeFileSync(manifestPath, content);
}

function resetServiceManifestVariables(): void {
  const copilotRoot = findCopilotRoot();
  if (!copilotRoot) return;

  const manifestPath = resolve(copilotRoot, SERVICE_NAME, "manifest.yml");
  if (!existsSync(manifestPath)) return;

  let content = readFileSync(manifestPath, "utf-8");
  content = content.replace(
    /^\s*NEXT_PUBLIC_BASE_URL:.*$/m,
    "  NEXT_PUBLIC_BASE_URL: # YOUR_DOMAIN, e.g. https://www.getinboxzero.com (with http or https)",
  );
  content = content.replace(
    /^\s*DEFAULT_LLM_PROVIDER:.*$/m,
    "  DEFAULT_LLM_PROVIDER:",
  );
  writeFileSync(manifestPath, content);
}

function setManifestVariable(
  content: string,
  key: string,
  value: string,
): string {
  const lineRegex = new RegExp(`^\\s*${key}:.*$`, "m");
  if (lineRegex.test(content)) {
    return content.replace(lineRegex, `  ${key}: ${value}`);
  }
  if (content.includes("variables:")) {
    return content.replace(
      /variables:\s*\n/,
      `variables:\n  ${key}: ${value}\n`,
    );
  }
  return content;
}

function getServiceUrl(envName: string, env: NodeJS.ProcessEnv): string | null {
  const result = spawnSync(
    "copilot",
    ["svc", "show", "-n", SERVICE_NAME, "--json"],
    { stdio: "pipe", env },
  );
  if (result.status !== 0) {
    return null;
  }

  const output = result.stdout?.toString().trim();
  if (!output) return null;

  try {
    const data = JSON.parse(output) as {
      routes?: { environment: string; url: string }[];
      variables?: { environment: string; name: string; value: string }[];
    };
    const route = data.routes?.find((r) => r.environment === envName);
    if (route?.url) return route.url;

    const lbDns = data.variables?.find(
      (v) => v.environment === envName && v.name === "COPILOT_LB_DNS",
    );
    if (lbDns?.value) return `http://${lbDns.value}`;
  } catch {
    const match = output.match(/https?:\/\/[^\s"]+/);
    if (match) return match[0];
  }

  return null;
}

function initCopilotApp(
  domain: string | undefined,
  env: NodeJS.ProcessEnv,
): { success: boolean; error?: string } {
  const args = ["app", "init", APP_NAME];
  if (domain) {
    args.push("--domain", domain);
  }

  const result = spawnSync("copilot", args, { stdio: "pipe", env });

  // Ignore "already exists" error
  if (
    result.status !== 0 &&
    !result.stderr?.toString().includes("already exists")
  ) {
    return {
      success: false,
      error: result.stderr?.toString() || "Failed to initialize app",
    };
  }

  return { success: true };
}

function initCopilotEnv(
  envName: string,
  profile: string,
  env: NodeJS.ProcessEnv,
  vpcImport?: VpcImportConfig | null,
): { success: boolean; error?: string } {
  const args = ["env", "init", "--name", envName, "--profile", profile];

  if (vpcImport?.vpcId) {
    args.push("--import-vpc-id", vpcImport.vpcId);
    args.push("--import-public-subnets", vpcImport.publicSubnets.join(","));
    args.push("--import-private-subnets", vpcImport.privateSubnets.join(","));
    if (vpcImport.certArns?.length) {
      args.push("--import-cert-arns", vpcImport.certArns.join(","));
    }
  } else {
    args.push("--default-config");
  }

  const result = spawnSync("copilot", args, { stdio: "pipe", env });

  // Ignore "already exists" error
  if (
    result.status !== 0 &&
    !result.stderr?.toString().includes("already exists")
  ) {
    return {
      success: false,
      error: result.stderr?.toString() || "Failed to initialize environment",
    };
  }

  // Ensure the environment manifest directory and file exist
  // Copilot sometimes doesn't create these with --default-config
  const copilotRoot = findCopilotRoot();
  if (copilotRoot) {
    const envManifestDir = resolve(copilotRoot, "environments", envName);
    const envManifestPath = resolve(envManifestDir, "manifest.yml");

    if (!existsSync(envManifestPath)) {
      // Create the directory
      if (!existsSync(envManifestDir)) {
        spawnSync("mkdir", ["-p", envManifestDir]);
      }

      // Generate the manifest from Copilot
      const showResult = spawnSync(
        "copilot",
        ["env", "show", "-n", envName, "--manifest"],
        { stdio: "pipe", env },
      );

      if (showResult.status === 0 && showResult.stdout) {
        writeFileSync(envManifestPath, showResult.stdout.toString());
      } else {
        // Fallback: create a minimal manifest
        const minimalManifest = `# The manifest for the "${envName}" environment.
name: ${envName}
type: Environment

observability:
  container_insights: false
`;
        writeFileSync(envManifestPath, minimalManifest);
      }
    }
  }

  return { success: true };
}

function deployCopilotEnv(
  envName: string,
  env: NodeJS.ProcessEnv,
): { success: boolean; error?: string } {
  // Verify manifest exists before deploying
  const copilotRoot = findCopilotRoot();
  if (copilotRoot) {
    const manifestPath = resolve(
      copilotRoot,
      "environments",
      envName,
      "manifest.yml",
    );
    if (!existsSync(manifestPath)) {
      return {
        success: false,
        error:
          `Environment manifest not found at ${manifestPath}.\n` +
          `Try running: copilot env show -n ${envName} --manifest > ${manifestPath}`,
      };
    }
  }

  const result = spawnSync("copilot", ["env", "deploy", "--name", envName], {
    stdio: ["inherit", "inherit", "pipe"],
    env,
  });

  const stderrOutput = result.stderr?.toString() || "";

  if (result.status !== 0) {
    const stackStatus = getEnvStackStatus(envName, env);
    if (stackStatus) {
      if (stackStatus.endsWith("_IN_PROGRESS")) {
        const waitedStatus = waitForEnvStackCompletion(envName, env);
        if (waitedStatus && isEnvStackHealthy(waitedStatus)) {
          return { success: true };
        }
      }
      if (isEnvStackHealthy(stackStatus)) {
        return { success: true };
      }
    }
    // Include the actual error for programmatic checking
    return {
      success: false,
      error:
        stderrOutput ||
        "Environment deployment failed. Check the output above for details.\n" +
          "Common issues:\n" +
          "- CloudFormation stack in ROLLBACK state (delete via AWS Console)\n" +
          "- IAM permission issues (ensure using IAM user, not root)\n" +
          "- Network/timeout issues (retry the command)",
    };
  }

  return { success: true };
}

function initCopilotService(env: NodeJS.ProcessEnv): {
  success: boolean;
  error?: string;
} {
  const result = spawnSync(
    "copilot",
    [
      "init",
      "--app",
      APP_NAME,
      "--name",
      SERVICE_NAME,
      "--type",
      "Load Balanced Web Service",
      "--deploy",
      "no",
    ],
    { stdio: "pipe", env },
  );

  // Ignore "already exists" error
  if (
    result.status !== 0 &&
    !result.stderr?.toString().includes("already exists")
  ) {
    return {
      success: false,
      error: result.stderr?.toString() || "Failed to initialize service",
    };
  }

  return { success: true };
}

function deployCopilotService(
  envName: string,
  env: NodeJS.ProcessEnv,
): { success: boolean; error?: string } {
  const result = spawnSync(
    "copilot",
    ["svc", "deploy", "--name", SERVICE_NAME, "--env", envName],
    { stdio: "inherit", env },
  );

  if (result.status !== 0) {
    return {
      success: false,
      error: "Service deployment failed",
    };
  }

  return { success: true };
}

function getEnvStackStatus(
  envName: string,
  env: NodeJS.ProcessEnv,
): string | null {
  const stackName = `${APP_NAME}-${envName}`;
  const result = spawnSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stackName,
      "--query",
      "Stacks[0].StackStatus",
      "--output",
      "text",
    ],
    { stdio: "pipe", env },
  );
  if (result.status !== 0) return null;
  return result.stdout.toString().trim() || null;
}

function waitForEnvStackCompletion(
  envName: string,
  env: NodeJS.ProcessEnv,
): string | null {
  const stackName = `${APP_NAME}-${envName}`;
  const updateWait = spawnSync(
    "aws",
    [
      "cloudformation",
      "wait",
      "stack-update-complete",
      "--stack-name",
      stackName,
    ],
    { stdio: "pipe", env },
  );
  if (updateWait.status !== 0) {
    spawnSync(
      "aws",
      [
        "cloudformation",
        "wait",
        "stack-create-complete",
        "--stack-name",
        stackName,
      ],
      { stdio: "pipe", env },
    );
  }
  return getEnvStackStatus(envName, env);
}

function isEnvStackHealthy(status: string): boolean {
  return status === "CREATE_COMPLETE" || status === "UPDATE_COMPLETE";
}

function storeSecretInSsm(
  name: string,
  value: string,
  envName: string,
  env: NodeJS.ProcessEnv,
): { success: boolean; error?: string } {
  const paramName = `/copilot/${APP_NAME}/${envName}/secrets/${name}`;

  const result = spawnSync(
    "aws",
    [
      "ssm",
      "put-parameter",
      "--name",
      paramName,
      "--value",
      value,
      "--type",
      "SecureString",
      "--overwrite",
    ],
    { stdio: "pipe", env },
  );

  if (result.status !== 0) {
    return {
      success: false,
      error: result.stderr?.toString() || `Failed to store ${name}`,
    };
  }

  const tagResult = spawnSync(
    "aws",
    [
      "ssm",
      "add-tags-to-resource",
      "--resource-type",
      "Parameter",
      "--resource-id",
      paramName,
      "--tags",
      `Key=copilot-application,Value=${APP_NAME}`,
      `Key=copilot-environment,Value=${envName}`,
    ],
    { stdio: "pipe", env },
  );

  if (tagResult.status !== 0) {
    return {
      success: false,
      error:
        tagResult.stderr?.toString() || `Failed to tag SSM parameter ${name}`,
    };
  }

  return { success: true };
}

function getWebhookUrl(envName: string, env: NodeJS.ProcessEnv): string {
  // Get the addon stack name
  const stackResult = spawnSync(
    "aws",
    [
      "cloudformation",
      "list-stack-resources",
      "--stack-name",
      `${APP_NAME}-${envName}`,
      "--query",
      "StackResourceSummaries[?contains(LogicalResourceId,'AddonsStack')].PhysicalResourceId",
      "--output",
      "text",
    ],
    { stdio: "pipe", env },
  );

  if (stackResult.status !== 0) {
    return "";
  }

  const addonStackName = stackResult.stdout.toString().trim();
  if (!addonStackName) {
    return "";
  }

  // Get the webhook URL from the addon stack outputs
  const urlResult = spawnSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      addonStackName,
      "--query",
      "Stacks[0].Outputs[?OutputKey=='WebhookEndpointUrl'].OutputValue",
      "--output",
      "text",
    ],
    { stdio: "pipe", env },
  );

  if (urlResult.status !== 0) {
    return "";
  }

  return urlResult.stdout.toString().trim();
}

function setupGooglePubSub(
  projectId: string,
  webhookUrl: string,
  topicName: string,
): { success: boolean; error?: string } {
  const fullTopicName = `projects/${projectId}/topics/${topicName}`;
  const subscriptionName = `${topicName}-subscription`;

  // Create topic (ignore if exists)
  spawnSync(
    "gcloud",
    ["pubsub", "topics", "create", topicName, "--project", projectId],
    { stdio: "pipe" },
  );

  // Grant Gmail service account publish permissions
  spawnSync(
    "gcloud",
    [
      "pubsub",
      "topics",
      "add-iam-policy-binding",
      topicName,
      "--member=serviceAccount:gmail-api-push@system.gserviceaccount.com",
      "--role=roles/pubsub.publisher",
      "--project",
      projectId,
    ],
    { stdio: "pipe" },
  );

  // Create push subscription with OIDC authentication
  const subResult = spawnSync(
    "gcloud",
    [
      "pubsub",
      "subscriptions",
      "create",
      subscriptionName,
      "--topic",
      topicName,
      "--push-endpoint",
      webhookUrl,
      "--push-auth-service-account",
      `pubsub-invoker@${projectId}.iam.gserviceaccount.com`,
      "--push-auth-token-audience",
      webhookUrl,
      "--project",
      projectId,
    ],
    { stdio: "pipe" },
  );

  // Ignore "already exists" error
  if (
    subResult.status !== 0 &&
    !subResult.stderr?.toString().includes("ALREADY_EXISTS")
  ) {
    return {
      success: false,
      error: subResult.stderr?.toString() || "Failed to create subscription",
    };
  }

  // Store the topic name in SSM
  const topicResult = spawnSync(
    "aws",
    [
      "ssm",
      "put-parameter",
      "--name",
      `/copilot/${APP_NAME}/production/secrets/GOOGLE_PUBSUB_TOPIC_NAME`,
      "--value",
      fullTopicName,
      "--type",
      "SecureString",
      "--overwrite",
    ],
    { stdio: "pipe" },
  );

  if (topicResult.status !== 0) {
    return {
      success: false,
      error: "Failed to store Pub/Sub topic name in SSM",
    };
  }

  spawnSync(
    "aws",
    [
      "ssm",
      "add-tags-to-resource",
      "--resource-type",
      "Parameter",
      "--resource-id",
      `/copilot/${APP_NAME}/production/secrets/GOOGLE_PUBSUB_TOPIC_NAME`,
      "--tags",
      `Key=copilot-application,Value=${APP_NAME}`,
      "Key=copilot-environment,Value=production",
    ],
    { stdio: "pipe" },
  );

  return { success: true };
}

function normalizeSecretReference(content: string, secretName: string): string {
  const normalized = getSecretReference(secretName);
  const pattern = new RegExp(`(^\\s+${secretName}:)\\s+.*$`, "m");
  return content.replace(pattern, `$1 ${normalized}`);
}

function getSecretReference(secretName: string): string {
  return `/copilot/\${COPILOT_APPLICATION_NAME}/\${COPILOT_ENVIRONMENT_NAME}/secrets/${secretName}`;
}

function normalizeDatabaseUrlParameters(
  envName: string,
  env: NodeJS.ProcessEnv,
): { success: boolean; error?: string } {
  const paramNames = [
    `/copilot/${APP_NAME}/${envName}/secrets/DATABASE_URL`,
    `/copilot/${APP_NAME}/${envName}/secrets/DIRECT_URL`,
  ];

  for (const paramName of paramNames) {
    const getResult = spawnSync(
      "aws",
      [
        "ssm",
        "get-parameter",
        "--name",
        paramName,
        "--with-decryption",
        "--query",
        "Parameter.Value",
        "--output",
        "text",
      ],
      { stdio: "pipe", env },
    );
    if (getResult.status !== 0) {
      return {
        success: false,
        error:
          getResult.stderr?.toString() || "Failed to read DB URL parameter",
      };
    }

    const currentUrl = getResult.stdout?.toString().trim();
    if (!currentUrl) {
      return {
        success: false,
        error: "DB URL parameter is empty",
      };
    }

    const normalized = normalizeDatabaseUrl(currentUrl);
    if (!normalized.success) {
      return { success: false, error: normalized.error };
    }

    if (!normalized.changed) {
      continue;
    }

    const putResult = spawnSync(
      "aws",
      [
        "ssm",
        "put-parameter",
        "--name",
        paramName,
        "--type",
        "String",
        "--value",
        normalized.url,
        "--overwrite",
      ],
      { stdio: "pipe", env },
    );
    if (putResult.status !== 0) {
      return {
        success: false,
        error:
          putResult.stderr?.toString() || "Failed to update DB URL parameter",
      };
    }

    spawnSync(
      "aws",
      [
        "ssm",
        "add-tags-to-resource",
        "--resource-type",
        "Parameter",
        "--resource-id",
        paramName,
        "--tags",
        `Key=copilot-application,Value=${APP_NAME}`,
        `Key=copilot-environment,Value=${envName}`,
      ],
      { stdio: "pipe", env },
    );
  }

  return { success: true };
}

function normalizeDatabaseUrl(
  url: string,
):
  | { success: true; url: string; changed: boolean }
  | { success: false; error: string } {
  try {
    // Will throw if invalid.
    // eslint-disable-next-line no-new
    new URL(url);
    return { success: true, url, changed: false };
  } catch {
    // Normalize by URL-encoding credentials.
  }

  const match = url.match(
    /^postgresql:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/(.+)$/,
  );
  if (!match) {
    return { success: false, error: "Unexpected DATABASE_URL format" };
  }

  const [, user, password, host, port, dbName] = match;
  const encoded = `postgresql://${encodeURIComponent(
    user,
  )}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`;
  return { success: true, url: encoded, changed: true };
}

function parseCsvList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function removeSecrets(content: string, secretNames: string[]): string {
  let updated = content;
  for (const secretName of secretNames) {
    const lineRegex = new RegExp(`^\\s*${secretName}:.*\\n?`, "m");
    updated = updated.replace(lineRegex, "");
  }
  return updated;
}
