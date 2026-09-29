import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTinybirdData } from "./delete";

const fetchMock = vi.fn();

describe("deleteTinybirdData", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TINYBIRD_TOKEN", "tinybird-token");
    vi.stubEnv("TINYBIRD_BASE_URL", "https://tinybird.test/");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("deletes AI calls and every mailbox datasource", async () => {
    await deleteTinybirdData({
      userIds: ["user-1"],
      emails: ["a@example.com", "b@example.com"],
    });

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      path: new URL(url).pathname,
      condition: new URLSearchParams(init.body).get("delete_condition"),
      auth: init.headers.Authorization,
    }));

    expect(calls).toEqual([
      {
        path: "/v0/datasources/aiCall/delete",
        condition: "userId IN ('user-1')",
        auth: "Bearer tinybird-token",
      },
      ...["email_action", "email", "last_and_oldest_emails_mv"].map(
        (datasource) => ({
          path: `/v0/datasources/${datasource}/delete`,
          condition: "ownerEmail IN ('a@example.com', 'b@example.com')",
          auth: "Bearer tinybird-token",
        }),
      ),
    ]);
  });

  it("escapes quotes in values", async () => {
    await deleteTinybirdData({ emails: ["o'brien@example.com"] });

    expect(
      new URLSearchParams(fetchMock.mock.calls[0][1].body).get(
        "delete_condition",
      ),
    ).toBe("ownerEmail IN ('o\\'brien@example.com')");
  });

  it("skips datasources that do not exist", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    await expect(
      deleteTinybirdData({ emails: ["a@example.com"] }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does nothing when Tinybird is not configured", async () => {
    vi.stubEnv("TINYBIRD_TOKEN", "");

    await deleteTinybirdData({ userIds: ["user-1"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
