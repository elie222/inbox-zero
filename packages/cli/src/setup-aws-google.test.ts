import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as p from "@clack/prompts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runAwsSetup } from "./setup-aws";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  isCancel: () => false,
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), success: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
  text: vi.fn(),
  select: vi.fn(),
  confirm: vi.fn(),
  group: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GOOGLE_PUBSUB_TOPIC_NAME", "");
  vi.stubEnv("BEDROCK_ACCESS_KEY", "access-key");
  vi.stubEnv("BEDROCK_SECRET_KEY", "secret-key");
  vi.spyOn(process, "chdir").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit:${code}`);
  });
  vi.mocked(existsSync).mockImplementation(
    (path) =>
      !String(path).endsWith(".bak") && !String(path).endsWith(".disabled"),
  );
  vi.mocked(readFileSync).mockReturnValue(
    "name: app\nsecrets:\nvariables:\nhttp:\n  path: '/'\nParameters:\n",
  );
  vi.mocked(p.text).mockResolvedValue("app.example.com");
  vi.mocked(p.select).mockImplementation(async (options) =>
    options.message === "LLM Provider:" ? "bedrock" : "db.t3.micro",
  );
  vi.mocked(p.confirm).mockImplementation(
    async (options) => !options.message.includes("Redis"),
  );
  vi.mocked(p.group).mockResolvedValue({
    clientId: "client",
    clientSecret: "secret",
  });
  vi.mocked(spawnSync).mockImplementation((_command, args) => {
    let stdout = "{}";
    if (args?.includes("auth")) stdout = '[{"account":"operator@example.com"}]';
    if (args?.includes("get-value")) stdout = "project";
    if (args?.includes("--format=value(projectNumber)")) stdout = "123456789";
    if (args?.includes("list-stack-resources")) stdout = "addon-stack";
    if (args?.some((arg) => String(arg).includes("WebhookEndpointUrl")))
      stdout = "https://gateway.example.com/api/google/webhook";
    return {
      status: 0,
      stdout: Buffer.from(stdout),
      stderr: Buffer.from(""),
    } as ReturnType<typeof spawnSync>;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  "",
  "projects/project/topics/custom-mail",
])("deploys and provisions the same Google topic for override %s", async (configuredTopic) => {
  vi.stubEnv("GOOGLE_PUBSUB_TOPIC_NAME", configuredTopic);
  await runAwsSetup({
    profile: "test",
    region: "us-east-1",
    environment: "staging",
  });
  const topic = configuredTopic || "projects/project/topics/app.example.com";
  const calls = vi.mocked(spawnSync).mock.calls;
  const topicWrites = calls.filter(
    ([, args]) =>
      args?.includes("put-parameter") &&
      args.some((arg) => String(arg).endsWith("/GOOGLE_PUBSUB_TOPIC_NAME")),
  );
  expect(topicWrites[0]?.[1]).toContain(topic);
  expect(topicWrites).toHaveLength(1);
  const deployment = calls.findIndex(
    ([command, args]) =>
      command === "copilot" && args?.[0] === "svc" && args[1] === "deploy",
  );
  expect(deployment).toBeGreaterThan(calls.indexOf(topicWrites[0]!));
  const topicCreation = calls.findIndex(
    ([command, args]) =>
      command === "gcloud" &&
      args?.[0] === "pubsub" &&
      args[1] === "topics" &&
      args[2] === "create",
  );
  expect(topicCreation).toBeGreaterThan(deployment);
  expect(calls[topicCreation]?.[1]).toContain(topic.split("/")[3]);
  const subscription = calls.find(
    ([, args]) =>
      args?.[0] === "pubsub" &&
      args[1] === "subscriptions" &&
      args[2] === "create",
  );
  const subscriptionArgs = subscription?.[1] || [];
  expect(
    `projects/${subscriptionArgs[subscriptionArgs.indexOf("--project") + 1]}/topics/${subscriptionArgs[subscriptionArgs.indexOf("--topic") + 1]}`,
  ).toBe(topic);
});

it.each([
  "projects/another-project/topics/mail",
  "invalid-topic",
])("rejects incompatible topic %s before cloud mutations", async (topic) => {
  vi.stubEnv("GOOGLE_PUBSUB_TOPIC_NAME", topic);
  await expect(
    runAwsSetup({
      profile: "test",
      region: "us-east-1",
      environment: "staging",
    }),
  ).rejects.toThrow(/GOOGLE_PUBSUB_TOPIC_NAME/);
  expect(
    vi
      .mocked(spawnSync)
      .mock.calls.some(
        ([command, args]) =>
          command === "copilot" && !args?.includes("--version"),
      ),
  ).toBe(false);
});
