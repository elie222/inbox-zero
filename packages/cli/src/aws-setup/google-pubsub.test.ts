import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupGooglePubSub } from "./google-pubsub";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
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
  it("provisions OIDC authentication and a deployment-specific tokenized subscription", async () => {
    const options = {
      subscriptionName: "mail-app-staging-subscription",
      projectId: "project",
      topicName: "mail",
      webhookUrl: "https://gateway.example.com/api/google/webhook",
      verificationToken: "verification-token",
    };
    expect(await setupGooglePubSub(options)).toEqual({ success: true });
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
        "--push-auth-service-account",
        "pubsub-invoker@project.iam.gserviceaccount.com",
        "--push-auth-token-audience",
        options.webhookUrl,
      ]),
    );
  });

  it("does not create a subscription if service-account provisioning fails", async () => {
    vi.mocked(spawnSync).mockImplementation(
      (_command, args) =>
        ({
          status: args?.includes("service-accounts") ? 1 : 0,
          stdout: Buffer.from(""),
          stderr: Buffer.from("PERMISSION_DENIED"),
        }) as ReturnType<typeof spawnSync>,
    );
    expect(
      (
        await setupGooglePubSub({
          subscriptionName: "mail-app-staging-subscription",
          projectId: "project",
          topicName: "mail",
          webhookUrl: "https://gateway.example.com/api/google/webhook",
          verificationToken: "token",
        })
      ).success,
    ).toBe(false);
    expect(
      vi
        .mocked(spawnSync)
        .mock.calls.some(([, args]) => args?.includes("subscriptions")),
    ).toBe(false);
  });
});

it("waits and retries when a newly created service account is not visible yet", async () => {
  const normal = vi.mocked(spawnSync).getMockImplementation();
  if (!normal) throw new Error("Expected spawnSync mock implementation");
  let bindings = 0;
  vi.mocked(spawnSync).mockImplementation((command, args, options) => {
    if (
      args?.includes("roles/iam.serviceAccountTokenCreator") &&
      ++bindings === 1
    )
      return {
        status: 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from("NOT_FOUND: service account not found"),
      } as ReturnType<typeof spawnSync>;
    return normal(command, args, options);
  });
  const result = setupGooglePubSub(setupOptions());
  expect(bindings).toBe(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(bindings).toBe(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ success: true });
  expect(bindings).toBe(2);
});

it.each([
  "PERMISSION_DENIED",
  "INVALID_ARGUMENT",
  "UNAUTHENTICATED",
])("does not retry permanent IAM failure %s", async (error) => {
  mockBindingFailure(error);
  expect(await setupGooglePubSub(setupOptions())).toEqual({
    success: false,
    error,
  });
  expect(vi.getTimerCount()).toBe(0);
  expect(bindingCalls()).toHaveLength(1);
});

it("stops after bounded exponential retries and preserves the final error", async () => {
  mockBindingFailure("UNAVAILABLE: temporary outage");
  const startedAt = Date.now();
  const result = setupGooglePubSub(setupOptions());
  await vi.runAllTimersAsync();
  expect(Date.now() - startedAt).toBe(95_000);
  expect(await result).toEqual({
    success: false,
    error: "UNAVAILABLE: temporary outage",
  });
  expect(bindingCalls()).toHaveLength(8);
  expect(
    vi
      .mocked(spawnSync)
      .mock.calls.some(([, args]) => args?.includes("subscriptions")),
  ).toBe(false);
});

function setupOptions() {
  return {
    subscriptionName: "mail-app-staging-subscription",
    projectId: "project",
    topicName: "mail",
    webhookUrl: "https://gateway.example.com/api/google/webhook",
    verificationToken: "token",
  };
}
function bindingCalls() {
  return vi
    .mocked(spawnSync)
    .mock.calls.filter(([, args]) =>
      args?.includes("roles/iam.serviceAccountTokenCreator"),
    );
}
function mockBindingFailure(error: string) {
  const normal = vi.mocked(spawnSync).getMockImplementation();
  if (!normal) throw new Error("Expected spawnSync mock implementation");
  vi.mocked(spawnSync).mockImplementation((command, args, options) =>
    args?.includes("roles/iam.serviceAccountTokenCreator")
      ? ({
          status: 1,
          stdout: Buffer.from(""),
          stderr: Buffer.from(error),
        } as ReturnType<typeof spawnSync>)
      : normal(command, args, options),
  );
}

it("does not retry NOT_FOUND for an existing account", async () => {
  const normal = vi.mocked(spawnSync).getMockImplementation();
  if (!normal) throw new Error("Expected spawnSync mock implementation");
  vi.mocked(spawnSync).mockImplementation((command, args, options) => {
    if (args?.includes("service-accounts") && args.includes("create"))
      return {
        status: 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from("ALREADY_EXISTS"),
      } as ReturnType<typeof spawnSync>;
    return normal(command, args, options);
  });
  mockBindingFailure("NOT_FOUND: account missing");
  expect(await setupGooglePubSub(setupOptions())).toEqual({
    success: false,
    error: "NOT_FOUND: account missing",
  });
  expect(bindingCalls()).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});
