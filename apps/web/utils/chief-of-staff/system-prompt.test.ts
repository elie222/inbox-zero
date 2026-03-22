import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSystemPrompt } from "./system-prompt";
import { AutonomyMode, CosCategory, Venture } from "./types";

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(
      () => "# Chief of Staff Base Prompt\nYou are Nick's assistant.",
    ),
  },
  readFileSync: vi.fn(
    () => "# Chief of Staff Base Prompt\nYou are Nick's assistant.",
  ),
}));

const defaultLevels = {
  [CosCategory.SCHEDULING]: AutonomyMode.AUTO_HANDLE,
  [CosCategory.SCHEDULING_CANCEL]: AutonomyMode.DRAFT_APPROVE,
  [CosCategory.CLIENT_PARENT]: AutonomyMode.DRAFT_APPROVE,
  [CosCategory.BUSINESS]: AutonomyMode.DRAFT_APPROVE,
  [CosCategory.URGENT]: AutonomyMode.FLAG_ONLY,
  [CosCategory.NOTIFICATION]: AutonomyMode.AUTO_HANDLE,
  [CosCategory.LOW_PRIORITY]: AutonomyMode.AUTO_HANDLE,
};

describe("buildSystemPrompt", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("includes base prompt content", () => {
    const result = buildSystemPrompt({
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: defaultLevels,
      currentDateTime: "2026-03-21T10:00:00",
    });
    expect(result).toContain("Chief of Staff");
  });

  it("includes venture name", () => {
    const result = buildSystemPrompt({
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: defaultLevels,
      currentDateTime: "2026-03-21T10:00:00",
    });
    expect(result).toContain("Smart College");
  });

  it("includes voice/tone text", () => {
    const result = buildSystemPrompt({
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: defaultLevels,
      currentDateTime: "2026-03-21T10:00:00",
    });
    expect(result).toContain("Warm and professional");
  });

  it("includes autonomy levels", () => {
    const result = buildSystemPrompt({
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: defaultLevels,
      currentDateTime: "2026-03-21T10:00:00",
    });
    expect(result).toContain("auto_handle");
  });

  it("includes day protection rules mentioning Tuesday", () => {
    const result = buildSystemPrompt({
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: defaultLevels,
      currentDateTime: "2026-03-21T10:00:00",
    });
    expect(result).toContain("Tuesday");
  });

  it("includes day protection rules mentioning Friday", () => {
    const result = buildSystemPrompt({
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: defaultLevels,
      currentDateTime: "2026-03-21T10:00:00",
    });
    expect(result).toContain("Friday");
  });

  it("includes same-day escalation rule", () => {
    const result = buildSystemPrompt({
      venture: Venture.SMART_COLLEGE,
      voiceTone: "Warm and professional",
      autonomyLevels: defaultLevels,
      currentDateTime: "2026-03-21T10:00:00",
    });
    expect(result).toContain("Same-Day Escalation");
  });
});
