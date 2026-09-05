import { spawnSync } from "node:child_process";
import { setupPubSubSubscription } from "../google-pubsub";
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
  verificationToken: string;
  envName: string;
  env: NodeJS.ProcessEnv;
}): { success: boolean; error?: string } {
  const { appName, projectId, webhookUrl, topicName, envName, env } = params;
  const fullTopicName = `projects/${projectId}/topics/${topicName}`;
  const subscriptionName = `${topicName}-${appName}-${envName}-subscription`;

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

  const serviceAccount = `pubsub-invoker@${projectId}.iam.gserviceaccount.com`;
  const accountResult = spawnSync(
    "gcloud",
    [
      "iam",
      "service-accounts",
      "create",
      "pubsub-invoker",
      "--project",
      projectId,
    ],
    { stdio: "pipe" },
  );
  if (
    accountResult.status !== 0 &&
    !accountResult.stderr?.toString().includes("ALREADY_EXISTS")
  ) {
    return {
      success: false,
      error:
        accountResult.stderr?.toString() ||
        "Failed to create push service account",
    };
  }
  const projectResult = spawnSync(
    "gcloud",
    ["projects", "describe", projectId, "--format=value(projectNumber)"],
    { stdio: "pipe" },
  );
  const projectNumber = projectResult.stdout?.toString().trim();
  if (projectResult.status !== 0 || !projectNumber) {
    return {
      success: false,
      error: "Failed to read project number for Pub/Sub authentication",
    };
  }
  const tokenResult = spawnSync(
    "gcloud",
    [
      "iam",
      "service-accounts",
      "add-iam-policy-binding",
      serviceAccount,
      "--member",
      `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`,
      "--role",
      "roles/iam.serviceAccountTokenCreator",
      "--project",
      projectId,
    ],
    { stdio: "pipe" },
  );
  if (tokenResult.status !== 0) {
    return {
      success: false,
      error:
        tokenResult.stderr?.toString() ||
        "Failed to authorize Pub/Sub OIDC tokens",
    };
  }

  const endpoint = new URL(webhookUrl);
  endpoint.searchParams.set("token", params.verificationToken);
  const subResult = setupPubSubSubscription(
    projectId,
    topicName,
    subscriptionName,
    endpoint.toString(),
    { serviceAccount, audience: webhookUrl },
  );
  if (!subResult.success) return subResult;

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
