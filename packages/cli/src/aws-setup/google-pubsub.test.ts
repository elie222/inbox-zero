import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupGooglePubSub } from "./google-pubsub";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(spawnSync).mockImplementation(
    (_command, args) =>
      ({
        status: 0,
        stdout: Buffer.from(
          args?.includes("--format=value(projectNumber)") ? "123456789" : "",
        ),
        stderr: Buffer.from(""),
      }) as ReturnType<typeof spawnSync>,
  );
});

describe("AWS Google push setup", () => {
  it("provisions OIDC authentication and a deployment-specific tokenized subscription", () => {
    const options = {
      appName: "app",
      projectId: "project",
      envName: "staging",
      topicName: "mail",
      webhookUrl: "https://gateway.example.com/api/google/webhook",
      verificationToken: "verification-token",
      env: {},
    };
    expect(setupGooglePubSub(options)).toEqual({ success: true });
    const calls = vi.mocked(spawnSync).mock.calls.map(([, args]) => args);
    expect(calls).toContainEqual(
      expect.arrayContaining(["service-accounts", "create", "pubsub-invoker"]),
    );
    expect(calls).toContainEqual(
      expect.arrayContaining([
        "service-accounts",
        "add-iam-policy-binding",
        "roles/iam.serviceAccountTokenCreator",
        "serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com",
      ]),
    );
    expect(calls).toContainEqual(
      expect.arrayContaining([
        "subscriptions",
        "create",
        "mail-app-staging-subscription",
        "--push-endpoint",
        `${options.webhookUrl}?token=verification-token`,
        "--push-auth-token-audience",
        options.webhookUrl,
      ]),
    );
  });

  it("does not create a subscription if service-account provisioning fails", () => {
    vi.mocked(spawnSync).mockImplementation(
      (_command, args) =>
        ({
          status: args?.includes("service-accounts") ? 1 : 0,
          stdout: Buffer.from(""),
          stderr: Buffer.from("PERMISSION_DENIED"),
        }) as ReturnType<typeof spawnSync>,
    );
    expect(
      setupGooglePubSub({
        appName: "app",
        projectId: "project",
        envName: "staging",
        topicName: "mail",
        webhookUrl: "https://gateway.example.com/api/google/webhook",
        verificationToken: "token",
        env: {},
      }).success,
    ).toBe(false);
    expect(
      vi
        .mocked(spawnSync)
        .mock.calls.some(([, args]) => args?.includes("subscriptions")),
    ).toBe(false);
  });
});
