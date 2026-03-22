import { describe, it, expect } from "vitest";
import { detectVenture } from "./venture-detector";
import { Venture } from "../types";

describe("detectVenture", () => {
  it("detects Smart College by inbox email", () => {
    const result = detectVenture({
      inboxEmail: "nick@smartcollege.com",
      senderEmail: "parent@gmail.com",
      clientGroupVenture: null,
    });
    expect(result).toBe(Venture.SMART_COLLEGE);
  });

  it("detects Praxis by inbox email", () => {
    const result = detectVenture({
      inboxEmail: "nick@growwithpraxis.com",
      senderEmail: "founder@startup.com",
      clientGroupVenture: null,
    });
    expect(result).toBe(Venture.PRAXIS);
  });

  it("detects Smart College by sender domain", () => {
    const result = detectVenture({
      inboxEmail: "leekenick@gmail.com",
      senderEmail: "student@smartcollege.com",
      clientGroupVenture: null,
    });
    expect(result).toBe(Venture.SMART_COLLEGE);
  });

  it("detects Smart College by client group association", () => {
    const result = detectVenture({
      inboxEmail: "leekenick@gmail.com",
      senderEmail: "parent@gmail.com",
      clientGroupVenture: Venture.SMART_COLLEGE,
    });
    expect(result).toBe(Venture.SMART_COLLEGE);
  });

  it("defaults to Personal when no venture can be detected", () => {
    const result = detectVenture({
      inboxEmail: "leekenick@gmail.com",
      senderEmail: "friend@gmail.com",
      clientGroupVenture: null,
    });
    expect(result).toBe(Venture.PERSONAL);
  });
});
