import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteTinybirdEmailData } from "./delete";

const fetchMock = vi.fn();

describe("deleteTinybirdEmailData", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TINYBIRD_TOKEN", "ingest-token");
    vi.stubEnv("TINYBIRD_DELETE_TOKEN", "delete-token");
    vi.stubEnv("TINYBIRD_BASE_URL", "https://tinybird.test/");
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("deletes mailbox rows and only AI usage rows keyed by the email address", async () => {
    await deleteTinybirdEmailData(["a@example.com", "b@example.com"]);

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      path: new URL(url).pathname,
      condition: new URLSearchParams(init.body).get("delete_condition"),
      auth: init.headers.Authorization,
    }));

    expect(calls).toEqual([
      {
        path: "/v0/datasources/aiCall/delete",
        condition: "userId IN ('a@example.com', 'b@example.com')",
        auth: "Bearer delete-token",
      },
      ...["email_action", "email", "last_and_oldest_emails_mv"].map(
        (datasource) => ({
          path: `/v0/datasources/${datasource}/delete`,
          condition: "ownerEmail IN ('a@example.com', 'b@example.com')",
          auth: "Bearer delete-token",
        }),
      ),
    ]);
  });

  it("escapes quotes in values", async () => {
    await deleteTinybirdEmailData(["o'brien@example.com"]);

    expect(
      new URLSearchParams(fetchMock.mock.calls[0][1].body).get(
        "delete_condition",
      ),
    ).toBe("userId IN ('o\\'brien@example.com')");
  });

  it("skips datasources that do not exist", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));

    await expect(
      deleteTinybirdEmailData(["a@example.com"]),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fails loudly when Tinybird is enabled without a delete token", async () => {
    vi.stubEnv("TINYBIRD_DELETE_TOKEN", "");

    await expect(deleteTinybirdEmailData(["a@example.com"])).rejects.toThrow(
      "TINYBIRD_DELETE_TOKEN is not set",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when Tinybird is not configured", async () => {
    vi.stubEnv("TINYBIRD_TOKEN", "");

    await deleteTinybirdEmailData(["a@example.com"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
