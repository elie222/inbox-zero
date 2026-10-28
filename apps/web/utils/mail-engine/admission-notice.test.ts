import { describe, expect, it } from "vitest";
import { admissionRejectionCopy } from "./admission-notice";

describe("admissionRejectionCopy", () => {
  it("explains a full local command queue", () => {
    expect(admissionRejectionCopy("queue_full")).toBe(
      "Mail is full of pending actions. Wait for some to finish, then try again.",
    );
  });

  it("explains disk pressure for blob and mailbox rejects", () => {
    expect(admissionRejectionCopy("too_large")).toBe(
      "This device does not have enough storage for that mail action.",
    );
    expect(admissionRejectionCopy("storage_unavailable")).toBe(
      "This device does not have enough storage for that mail action.",
    );
  });

  it("leaves other rejects to the caller", () => {
    expect(admissionRejectionCopy("invalid")).toBeUndefined();
    expect(admissionRejectionCopy("stale_selection")).toBeUndefined();
    expect(admissionRejectionCopy(undefined)).toBeUndefined();
  });
});
