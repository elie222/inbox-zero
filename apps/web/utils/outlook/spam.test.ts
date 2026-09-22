import { describe, expect, it, vi } from "vitest";
import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { markNotSpam, markSpam } from "./spam";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/microsoft/retry", () => ({
  withMicrosoftGraphWriteRetry: <T>(operation: () => Promise<T>) => operation(),
}));

describe("outlook spam mutations", () => {
  it("moves thread messages to Junk when marking spam", async () => {
    const { client, posts } = createClient(["m1", "m2"]);
    await markSpam(client, "thread-1", createScopedLogger("test"));
    expect(posts).toEqual([
      { path: "/me/messages/m1/move", body: { destinationId: "junkemail" } },
      { path: "/me/messages/m2/move", body: { destinationId: "junkemail" } },
    ]);
  });

  it("moves thread messages to Inbox when marking not spam", async () => {
    const { client, posts } = createClient(["m1"]);
    await markNotSpam(client, "thread-1", createScopedLogger("test"));
    expect(posts).toEqual([
      { path: "/me/messages/m1/move", body: { destinationId: "inbox" } },
    ]);
  });
});

function createClient(messageIds: string[]) {
  const posts: Array<{ path: string; body: unknown }> = [];
  let selectedPath = "";
  const api = vi.fn((path: string) => {
    selectedPath = path;
    return {
      filter: vi.fn().mockReturnThis(),
      async get() {
        return { value: messageIds.map((id) => ({ id })) };
      },
      async post(body: unknown) {
        posts.push({ path: selectedPath, body });
        return {};
      },
    };
  });
  const client = {
    getClient: () => ({ api }),
  } as unknown as OutlookClient;
  return { client, posts };
}
