import { describe, expect, it } from "vitest";
import { mapUiMessagesToChatMessageRows } from "./chat-message-persistence";

describe("mapUiMessagesToChatMessageRows", () => {
  it("preserves message IDs when mapping rows", () => {
    const rows = mapUiMessagesToChatMessageRows(
      [
        {
          id: "assistant-message-1",
          role: "assistant",
          parts: [{ type: "text", text: "Prepared a reply." }],
        } as any,
      ],
      "chat-1",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "assistant-message-1",
      chatId: "chat-1",
      role: "assistant",
    });
    expect(rows[0].parts).toEqual([
      { type: "text", text: "Prepared a reply." },
    ]);
  });

  it("omits empty message IDs so the database can generate one", () => {
    const rows = mapUiMessagesToChatMessageRows(
      [
        {
          id: "   ",
          role: "assistant",
          parts: [{ type: "text", text: "Done." }],
        } as any,
      ],
      "chat-1",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chatId: "chat-1",
      role: "assistant",
      parts: [{ type: "text", text: "Done." }],
    });
    expect(rows[0]).not.toHaveProperty("id");
  });
});
