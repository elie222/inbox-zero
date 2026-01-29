import { spawnSync } from "node:child_process";
import { putSsmParameterWithTags, runAwsCommand } from "./aws-cli";

export function getWebhookUrl(
  appName: string,
  envName: string,
  env: NodeJS.ProcessEnv,
): string {
  const stackResult = runAwsCommand(env, [
    "cloudformation",
    "list-stack-resources",
    "--stack-name",
    `${appName}-${envName}`,
    "--query",
    "StackResourceSummaries[?contains(LogicalResourceId,'AddonsStack')].PhysicalResourceId",
    "--output",
    "text",
  ]);
  if (!stackResult.success) {
    return "";
  }

  const addonStackName = stackResult.stdout.trim();
  if (!addonStackName) {
    return "";
  }

  const urlResult = runAwsCommand(env, [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    addonStackName,
    "--query",
    "Stacks[0].Outputs[?OutputKey=='WebhookEndpointUrl'].OutputValue",
    "--output",
    "text",
  ]);
  if (!urlResult.success) {
    return "";
  }

  return urlResult.stdout.trim();
}

export function setupGooglePubSub(params: {
  appName: string;
  projectId: string;
  webhookUrl: string;
  topicName: string;
  envName: string;
  env: NodeJS.ProcessEnv;
}): { success: boolean; error?: string } {
  const { appName, projectId, webhookUrl, topicName, envName, env } = params;
  const fullTopicName = `projects/${projectId}/topics/${topicName}`;
  const subscriptionName = `${topicName}-subscription`;

  // Create topic (ignore if exists)
  spawnSync(
    "gcloud",
    ["pubsub", "topics", "create", topicName, "--project", projectId],
    { stdio: "pipe" },
  );

  // Grant Gmail service account publish permissions
  const iamResult = spawnSync(
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
  if (iamResult.status !== 0) {
    return {
      success: false,
      error:
        iamResult.stderr?.toString() ||
        "Failed to grant Gmail Pub/Sub publish permissions",
    };
  }

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

  const topicResult = putSsmParameterWithTags({
    env,
    appName,
    envName,
    name: `/copilot/${appName}/${envName}/secrets/GOOGLE_PUBSUB_TOPIC_NAME`,
    value: fullTopicName,
    type: "SecureString",
    errorMessage: "Failed to store Pub/Sub topic name in SSM",
  });
  if (!topicResult.success) {
    return { success: false, error: topicResult.error };
  }

  return { success: true };
}
