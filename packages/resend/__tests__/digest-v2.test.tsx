import { describe, it, expect } from "vitest";
import DigestV2Email from "../emails/digest-v2";

// Reference DigestV2Email so the import is not elided; actual rendering is wired up in 04-05.
const _DigestV2EmailRef = DigestV2Email;

describe("digest-v2.tsx prop-driven render", () => {
  it.skip("renders narrativeGreeting and narrativeBody verbatim from props", () => {
    expect.fail("implemented in 04-05");
  });
  it.skip("renders one card per urgent[] entry and one card per uncertain[] entry", () => {
    expect.fail("implemented in 04-05");
  });
  it.skip("renders auto-filed sections in fixed order: receipts → newsletters → marketing → notifications", () => {
    expect.fail("implemented in 04-05");
  });
});
