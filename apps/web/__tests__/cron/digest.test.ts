import { describe, it, expect } from "vitest";

describe("/api/cron/digest", () => {
  it.skip("returns 401 without Bearer CRON_SECRET", () => {
    expect.fail("implemented in 04-05");
  });
  it.skip("queries Digests where status != SENT and groups them by emailAccountId", () => {
    expect.fail("implemented in 04-05");
  });
  it.skip("skips immediately if a DigestSend row exists for today's ET date", () => {
    expect.fail("implemented in 04-05");
  });
});
