import { describe, it, expect } from "vitest";

describe("Digest idempotency state machine (D-14)", () => {
  it.skip("transitions PENDING → PROCESSING → SENT on success", () => {
    expect.fail("implemented in 04-05");
  });
  it.skip("rolls PROCESSING → FAILED on error and does not create DigestSend", () => {
    expect.fail("implemented in 04-05");
  });
  it.skip("second cron on same date short-circuits via DigestSend.findUnique", () => {
    expect.fail("implemented in 04-05");
  });
});
