import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { putSsmParameterWithTags } from "./aws-cli";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("preserving SSM secrets", () => {
  it("does not overwrite an existing secret and accepts ParameterAlreadyExists", () => {
    vi.mocked(spawnSync).mockImplementation((_command, args) => {
      const overwrites = args?.includes("--overwrite");
      return {
        status: overwrites ? 0 : 1,
        stdout: Buffer.from(""),
        stderr: Buffer.from(
          overwrites
            ? ""
            : "An error occurred (ParameterAlreadyExists) when calling PutParameter",
        ),
      } as ReturnType<typeof spawnSync>;
    });
    expect(
      putSsmParameterWithTags({
        env: {},
        appName: "app",
        envName: "test",
        name: "/secret",
        value: "replacement",
        type: "SecureString",
        errorMessage: "failed",
        overwrite: false,
      }),
    ).toEqual({ success: true });
    const put = vi
      .mocked(spawnSync)
      .mock.calls.find(([, args]) => args?.includes("put-parameter"));
    expect(put?.[1]).not.toContain("--overwrite");
  });

  it("propagates access failures instead of treating them as existing parameters", () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: Buffer.from(""),
      stderr: Buffer.from("AccessDeniedException"),
    } as ReturnType<typeof spawnSync>);
    expect(
      putSsmParameterWithTags({
        env: {},
        appName: "app",
        envName: "test",
        name: "/secret",
        value: "replacement",
        type: "SecureString",
        errorMessage: "failed",
        overwrite: false,
      }),
    ).toEqual({ success: false, error: "AccessDeniedException" });
  });
});
