import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithAccount } from "@/utils/fetch";
import { fetchAttachment } from "./download";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));

describe("fetchAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the attachment with the selected email account", async () => {
    const blob = new Blob(["attachment"]);
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(blob, { status: 200 }),
    );

    await expect(
      fetchAttachment({
        url: "/api/messages/attachment?messageId=message-id",
        emailAccountId: "account-id",
      }),
    ).resolves.toEqual(blob);

    expect(fetchWithAccount).toHaveBeenCalledWith({
      url: "/api/messages/attachment?messageId=message-id",
      emailAccountId: "account-id",
    });
  });

  it("rejects an unsuccessful attachment response", async () => {
    vi.mocked(fetchWithAccount).mockResolvedValue(
      new Response(null, { status: 403 }),
    );

    await expect(
      fetchAttachment({
        url: "/api/messages/attachment?messageId=message-id",
        emailAccountId: "account-id",
      }),
    ).rejects.toThrow("Failed to download attachment");
  });

  it("rejects before fetching when the email account is unavailable", async () => {
    await expect(
      fetchAttachment({
        url: "/api/messages/attachment?messageId=message-id",
        emailAccountId: "",
      }),
    ).rejects.toThrow("Email account ID is required");

    expect(fetchWithAccount).not.toHaveBeenCalled();
  });
});
