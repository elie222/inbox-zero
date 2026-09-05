import { spawnSync } from "node:child_process";

export function setupPubSubSubscription(
  projectId: string,
  topicName: string,
  subscriptionName: string,
  webhookUrl: string,
  authentication?: { serviceAccount: string; audience: string },
): { success: boolean; error?: string } {
  const pushConfig = [
    "--push-endpoint",
    webhookUrl,
    ...(authentication
      ? [
          "--push-auth-service-account",
          authentication.serviceAccount,
          "--push-auth-token-audience",
          authentication.audience,
        ]
      : []),
  ];
  const createResult = spawnSync(
    "gcloud",
    [
      "pubsub",
      "subscriptions",
      "create",
      subscriptionName,
      "--topic",
      topicName,
      ...pushConfig,
      "--project",
      projectId,
    ],
    { stdio: "pipe" },
  );

  if (createResult.status === 0) return { success: true };
  if (!createResult.stderr?.toString().includes("ALREADY_EXISTS")) {
    return {
      success: false,
      error: createResult.stderr?.toString() || "Failed to create subscription",
    };
  }

  const topicResult = spawnSync(
    "gcloud",
    [
      "pubsub",
      "subscriptions",
      "describe",
      subscriptionName,
      "--project",
      projectId,
      "--format=value(topic)",
    ],
    { stdio: "pipe" },
  );
  const expectedTopic = topicName.startsWith("projects/")
    ? topicName
    : `projects/${projectId}/topics/${topicName}`;
  if (
    topicResult.status !== 0 ||
    topicResult.stdout?.toString().trim() !== expectedTopic
  ) {
    return {
      success: false,
      error: "Existing subscription does not belong to the expected topic",
    };
  }
  const updateResult = spawnSync(
    "gcloud",
    [
      "pubsub",
      "subscriptions",
      "modify-push-config",
      subscriptionName,
      ...pushConfig,
      "--project",
      projectId,
    ],
    { stdio: "pipe" },
  );
  if (updateResult.status !== 0) {
    return {
      success: false,
      error: updateResult.stderr?.toString() || "Failed to update subscription",
    };
  }
  return { success: true };
}
