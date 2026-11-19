import { describe, expect, it, vi } from "vitest";
import { endsWithPendingBulkInboxAction } from "./chat-bulk-inbox-tool";

vi.mock("server-only", () => ({}));

describe("endsWithPendingBulkInboxAction", () => {
  it("ends the turn when a bulk action card is waiting for the user", () => {
    expect(
      endsWithPendingBulkInboxAction({
        toolResults: [
          {
            toolName: "bulkManageInbox",
            output: {
              requiresConfirmation: true,
              confirmationState: "pending",
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it("lets the model reply when the bulk search found nothing to do", () => {
    expect(
      endsWithPendingBulkInboxAction({
        toolResults: [
          {
            toolName: "bulkManageInbox",
            output: { success: true, estimatedThreadCount: 0 },
          },
          { toolName: "searchInbox", output: { requiresConfirmation: true } },
        ],
      }),
    ).toBe(false);
  });
});
