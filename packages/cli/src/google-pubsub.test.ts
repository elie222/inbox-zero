import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setupPubSubSubscription } from "./google-pubsub";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("existing Google push subscription", () => {
  it("updates the endpoint and token when setup is repeated", () => {
    vi.mocked(spawnSync).mockImplementation((_command, args) => {
      if (args?.includes("create"))
        return {
          status: 1,
          stdout: Buffer.from(""),
          stderr: Buffer.from("ALREADY_EXISTS"),
        } as ReturnType<typeof spawnSync>;
      if (args?.includes("describe"))
        return {
          status: 0,
          stdout: Buffer.from("projects/project/topics/mail"),
          stderr: Buffer.from(""),
        } as ReturnType<typeof spawnSync>;
      return {
        status: 0,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      } as ReturnType<typeof spawnSync>;
    });
    expect(
      setupPubSubSubscription(
        "project",
        "mail",
        "mail-sub",
        "https://new.example.com/api/google/webhook?token=new-token",
      ).success,
    ).toBe(true);
    const updated = vi
      .mocked(spawnSync)
      .mock.calls.filter(([, args]) => args?.includes("modify-push-config"));
    expect(updated).toHaveLength(1);
    expect(updated[0]?.[1]).toContain(
      "https://new.example.com/api/google/webhook?token=new-token",
    );
  });
});

it("refuses to repoint a subscription belonging to a different topic", () => {
  vi.mocked(spawnSync).mockImplementation(
    (_command, args) =>
      ({
        status: args?.includes("create") ? 1 : 0,
        stdout: Buffer.from("projects/project/topics/other"),
        stderr: Buffer.from("ALREADY_EXISTS"),
      }) as ReturnType<typeof spawnSync>,
  );
  expect(
    setupPubSubSubscription(
      "project",
      "mail",
      "mail-sub",
      "https://example.com/webhook",
    ).success,
  ).toBe(false);
  expect(
    vi
      .mocked(spawnSync)
      .mock.calls.some(([, args]) => args?.includes("modify-push-config")),
  ).toBe(false);
});

it("reports push-configuration update failures", () => {
  vi.mocked(spawnSync).mockImplementation(
    (_command, args) =>
      ({
        status: args?.includes("describe") ? 0 : 1,
        stdout: Buffer.from("projects/project/topics/mail"),
        stderr: Buffer.from(
          args?.includes("create") ? "ALREADY_EXISTS" : "PERMISSION_DENIED",
        ),
      }) as ReturnType<typeof spawnSync>,
  );
  expect(
    setupPubSubSubscription(
      "project",
      "mail",
      "mail-sub",
      "https://example.com/webhook",
    ),
  ).toEqual({ success: false, error: "PERMISSION_DENIED" });
});

it("reports failed subscription inspection without claiming a topic mismatch", () => {
  vi.mocked(spawnSync).mockImplementation(
    (_command, args) =>
      ({
        status: 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from(
          args?.includes("create") ? "ALREADY_EXISTS" : "PERMISSION_DENIED",
        ),
      }) as ReturnType<typeof spawnSync>,
  );
  expect(
    setupPubSubSubscription(
      "project",
      "mail",
      "mail-sub",
      "https://example.com/webhook",
    ),
  ).toEqual({ success: false, error: "PERMISSION_DENIED" });
});
