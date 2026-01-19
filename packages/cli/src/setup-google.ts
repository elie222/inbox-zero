import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import { generateSecret } from "./utils";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface GcloudPrerequisites {
  installed: boolean;
  authenticated: boolean;
  projectId: string | null;
}

interface SetupResult {
  success: boolean;
  error?: string;
}

export interface GoogleSetupOptions {
  projectId?: string;
  domain?: string;
  skipOauth?: boolean;
  skipPubsub?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Setup Function
// ═══════════════════════════════════════════════════════════════════════════

export async function runGoogleSetup(options: GoogleSetupOptions) {
  p.intro("Google Cloud Setup for Inbox Zero");

  // Step 1: Check prerequisites
  const spinner = p.spinner();
  spinner.start("Checking gcloud CLI...");

  const prereqs = checkGcloudPrerequisites();

  if (!prereqs.installed) {
    spinner.stop("gcloud CLI not found");
    p.log.error(
      "The gcloud CLI is not installed.\n" +
        "Please install it from: https://cloud.google.com/sdk/docs/install\n" +
        "After installation, run: gcloud auth login",
    );
    process.exit(1);
  }

  spinner.stop("gcloud CLI found");

  // Step 2: Ensure authentication
  if (!prereqs.authenticated) {
    p.log.warn("You are not authenticated with gcloud.");
    const authenticate = await p.confirm({
      message: "Would you like to authenticate now?",
      initialValue: true,
    });

    if (p.isCancel(authenticate) || !authenticate) {
      p.cancel("Setup cancelled. Run 'gcloud auth login' manually first.");
      process.exit(0);
    }

    p.log.info("Opening browser for authentication...");
    spawnSync("gcloud", ["auth", "login"], { stdio: "inherit" });
  }

  // Step 3: Get project ID
  let projectId = options.projectId || prereqs.projectId;

  if (!projectId) {
    const inputProjectId = await p.text({
      message: "Enter your Google Cloud project ID:",
      placeholder: "my-project-123",
      validate: (v) => (v ? undefined : "Project ID is required"),
    });

    if (p.isCancel(inputProjectId)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    projectId = inputProjectId;
  } else {
    p.log.info(`Using project: ${projectId}`);
  }

  // Step 4: Get domain (needed for OAuth redirect URIs and Pub/Sub webhook)
  let domain = options.domain;

  if (!domain) {
    const inputDomain = await p.text({
      message:
        "Enter your app domain (for OAuth redirects and Pub/Sub webhook):",
      placeholder: "app.example.com",
      validate: (v) => {
        if (!v) return undefined; // Allow empty for localhost development
        if (!v.includes(".")) return "Enter a valid domain";
        return undefined;
      },
    });

    if (p.isCancel(inputDomain)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    domain = inputDomain || undefined;
  }

  // Step 5: Enable required APIs
  spinner.start(
    "Enabling Google Cloud APIs (Gmail, People, Calendar, Drive, Pub/Sub)...",
  );

  const apiResult = enableGoogleApis(projectId);

  if (!apiResult.success) {
    spinner.stop("Failed to enable APIs");
    p.log.error(apiResult.error || "Unknown error");
    process.exit(1);
  }

  spinner.stop("APIs enabled successfully");

  // Step 6: OAuth Consent Screen guidance (if not skipped)
  let clientId = "";
  let clientSecret = "";

  if (!options.skipOauth) {
    const consentUrl = `https://console.cloud.google.com/apis/credentials/consent?project=${projectId}`;

    p.note(
      `Before creating OAuth credentials, you need to configure the consent screen.

Steps:
1. Select "External" user type (or "Internal" for Google Workspace)
2. App name: "Inbox Zero" (or your preferred name)
3. User support email: Your email
4. Developer contact: Your email
5. Click "Save and Continue" through the scopes section
6. Add your email as a test user
7. Complete the wizard

The console will open in your browser.`,
      "OAuth Consent Screen",
    );

    const openConsent = await p.confirm({
      message: "Open OAuth consent screen in browser?",
      initialValue: true,
    });

    if (openConsent && !p.isCancel(openConsent)) {
      openBrowser(consentUrl);
    }

    const consentDone = await p.confirm({
      message: "Have you completed the consent screen setup?",
      initialValue: false,
    });

    if (p.isCancel(consentDone) || !consentDone) {
      p.log.warn(
        "You can continue, but OAuth won't work until the consent screen is configured.",
      );
    }

    // Step 7: OAuth Credentials guidance
    const credentialsUrl = `https://console.cloud.google.com/apis/credentials/oauthclient?project=${projectId}`;
    const redirectUris = domain
      ? `   - https://${domain}/api/auth/callback/google
   - https://${domain}/api/google/linking/callback
   - https://${domain}/api/google/calendar/callback
   - https://${domain}/api/google/drive/callback`
      : `   - http://localhost:3000/api/auth/callback/google
   - http://localhost:3000/api/google/linking/callback
   - http://localhost:3000/api/google/calendar/callback
   - http://localhost:3000/api/google/drive/callback`;

    p.note(
      `Now create OAuth 2.0 credentials:

1. Select "Web application" as the application type
2. Name: "Inbox Zero" (or your preferred name)
3. Add Authorized redirect URIs:
${redirectUris}
4. Click "Create"
5. Copy the Client ID and Client Secret

The console will open in your browser.`,
      "OAuth Credentials",
    );

    const openCredentials = await p.confirm({
      message: "Open OAuth credentials page in browser?",
      initialValue: true,
    });

    if (openCredentials && !p.isCancel(openCredentials)) {
      openBrowser(credentialsUrl);
    }

    const oauthInput = await p.group(
      {
        clientId: () =>
          p.text({
            message: "Paste your Google Client ID:",
            placeholder: "123456789012-abc.apps.googleusercontent.com",
            validate: (v) => {
              if (!v) return undefined; // Allow empty to skip
              if (!v.endsWith(".apps.googleusercontent.com")) {
                return "Client ID should end with .apps.googleusercontent.com";
              }
              return undefined;
            },
          }),
        clientSecret: () =>
          p.text({
            message: "Paste your Google Client Secret:",
            placeholder: "GOCSPX-...",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    clientId = oauthInput.clientId || "";
    clientSecret = oauthInput.clientSecret || "";
  }

  // Step 8: Pub/Sub setup (automated)
  const topicName = "inbox-zero-emails";
  const subscriptionName = "inbox-zero-subscription";
  const verificationToken = generateSecret(32);
  let topicFullName = "";
  let pubsubSuccess = false;

  if (!options.skipPubsub && domain) {
    const webhookUrl = `https://${domain}/api/google/webhook?token=${verificationToken}`;
    topicFullName = `projects/${projectId}/topics/${topicName}`;

    spinner.start("Creating Pub/Sub topic...");

    const topicResult = setupPubSubTopic(projectId, topicName);

    if (!topicResult.success) {
      spinner.stop("Failed to create Pub/Sub topic");
      p.log.error(topicResult.error || "Unknown error");
      p.log.warn("You can set up Pub/Sub manually later.");
    } else {
      spinner.stop("Pub/Sub topic created with Gmail permissions");

      spinner.start("Creating Pub/Sub push subscription...");

      const subResult = setupPubSubSubscription(
        projectId,
        topicName,
        subscriptionName,
        webhookUrl,
      );

      if (!subResult.success) {
        spinner.stop("Failed to create subscription");
        p.log.error(subResult.error || "Unknown error");
        p.log.warn(
          "You can create the subscription manually:\n" +
            `gcloud pubsub subscriptions create ${subscriptionName} --topic=${topicName} --push-endpoint="${webhookUrl}" --project=${projectId}`,
        );
      } else {
        spinner.stop("Pub/Sub subscription created");
        pubsubSuccess = true;
      }
    }
  }

  // Step 9: Output environment variables
  const envVars: string[] = [];

  if (clientId) {
    envVars.push(`GOOGLE_CLIENT_ID=${clientId}`);
  }
  if (clientSecret) {
    envVars.push(`GOOGLE_CLIENT_SECRET=${clientSecret}`);
  }
  // Always output Pub/Sub vars when attempted (even if failed) so user can complete manual setup
  if (!options.skipPubsub && domain) {
    envVars.push(`GOOGLE_PUBSUB_TOPIC_NAME=${topicFullName}`);
    envVars.push(`GOOGLE_PUBSUB_VERIFICATION_TOKEN=${verificationToken}`);
  }

  if (envVars.length > 0) {
    p.note(
      `Add these to your .env file:\n\n${envVars.join("\n")}`,
      "Environment Variables",
    );
  }

  // Summary
  const summary = [
    "✓ APIs enabled (Gmail, People, Calendar, Drive, Pub/Sub)",
    options.skipOauth
      ? "✗ OAuth setup skipped"
      : clientId
        ? "✓ OAuth credentials configured"
        : "! OAuth credentials not provided",
    options.skipPubsub
      ? "✗ Pub/Sub setup skipped"
      : !domain
        ? "! Pub/Sub setup skipped (no domain provided)"
        : pubsubSuccess
          ? "✓ Pub/Sub topic and subscription created"
          : "! Pub/Sub setup incomplete (env vars provided for manual setup)",
  ].join("\n");

  p.note(summary, "Setup Summary");

  p.outro("Google Cloud setup complete!");
}

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

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

function enableGoogleApis(projectId: string): SetupResult {
  const apis = [
    "gmail.googleapis.com",
    "people.googleapis.com",
    "calendar-json.googleapis.com",
    "drive.googleapis.com",
    "pubsub.googleapis.com",
  ];

  const result = spawnSync(
    "gcloud",
    ["services", "enable", ...apis, "--project", projectId],
    { stdio: "pipe" },
  );

  if (result.status !== 0) {
    return {
      success: false,
      error: result.stderr?.toString() || "Failed to enable APIs",
    };
  }

  return { success: true };
}

function setupPubSubTopic(projectId: string, topicName: string): SetupResult {
  // Create topic
  const createResult = spawnSync(
    "gcloud",
    ["pubsub", "topics", "create", topicName, "--project", projectId],
    { stdio: "pipe" },
  );

  // Ignore "already exists" error
  if (
    createResult.status !== 0 &&
    !createResult.stderr?.toString().includes("ALREADY_EXISTS")
  ) {
    return {
      success: false,
      error: createResult.stderr?.toString() || "Failed to create topic",
    };
  }

  // Grant Gmail service account publish permissions
  const bindingResult = spawnSync(
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

  if (bindingResult.status !== 0) {
    return {
      success: false,
      error: bindingResult.stderr?.toString() || "Failed to add IAM binding",
    };
  }

  return { success: true };
}

function setupPubSubSubscription(
  projectId: string,
  topicName: string,
  subscriptionName: string,
  webhookUrl: string,
): SetupResult {
  const createResult = spawnSync(
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
      "--project",
      projectId,
    ],
    { stdio: "pipe" },
  );

  // Ignore "already exists" error
  if (
    createResult.status !== 0 &&
    !createResult.stderr?.toString().includes("ALREADY_EXISTS")
  ) {
    return {
      success: false,
      error: createResult.stderr?.toString() || "Failed to create subscription",
    };
  }

  return { success: true };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "start"
        : "xdg-open";
  // Windows 'start' is a shell built-in, not an executable
  spawnSync(cmd, [url], { stdio: "pipe", shell: platform === "win32" });
}
