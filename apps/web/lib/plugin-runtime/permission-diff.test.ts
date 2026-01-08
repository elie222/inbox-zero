/**
 * Tests for permission difference detection.
 */

import { describe, it, expect } from "vitest";
import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import {
  comparePermissions,
  formatPermissionChangeSummary,
  type PermissionDiff,
} from "./permission-diff";

function createManifest(capabilities: string[] = []): PluginManifest {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    inboxZero: { minVersion: "0.1.0" },
    capabilities: capabilities as any,
    entry: "index.ts",
  };
}

describe("comparePermissions", () => {
  it("detects added capabilities", () => {
    const current = createManifest(["email:classify"]);
    const updated = createManifest(["email:classify", "email:send"]);

    const diff = comparePermissions(current, updated);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].name).toBe("email:send");
    expect(diff.added[0].description).toBe("Send emails on your behalf");
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.hasChanges).toBe(true);
  });

  it("detects removed capabilities", () => {
    const current = createManifest(["email:classify", "email:send"]);
    const updated = createManifest(["email:classify"]);

    const diff = comparePermissions(current, updated);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].name).toBe("email:send");
    expect(diff.removed[0].description).toBe("Send emails on your behalf");
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.hasChanges).toBe(true);
  });

  it("detects unchanged capabilities", () => {
    const current = createManifest(["email:classify", "email:send"]);
    const updated = createManifest(["email:classify", "email:send"]);

    const diff = comparePermissions(current, updated);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(2);
    expect(diff.hasChanges).toBe(false);
  });

  it("handles multiple added and removed capabilities", () => {
    const current = createManifest([
      "email:classify",
      "email:send",
      "calendar:read",
    ]);
    const updated = createManifest([
      "email:classify",
      "email:modify",
      "calendar:write",
    ]);

    const diff = comparePermissions(current, updated);

    expect(diff.added).toHaveLength(2);
    expect(diff.added.map((c) => c.name)).toContain("email:modify");
    expect(diff.added.map((c) => c.name)).toContain("calendar:write");

    expect(diff.removed).toHaveLength(2);
    expect(diff.removed.map((c) => c.name)).toContain("email:send");
    expect(diff.removed.map((c) => c.name)).toContain("calendar:read");

    expect(diff.unchanged).toHaveLength(1);
    expect(diff.unchanged[0].name).toBe("email:classify");
    expect(diff.hasChanges).toBe(true);
  });

  it("handles empty capabilities arrays", () => {
    const current = createManifest([]);
    const updated = createManifest([]);

    const diff = comparePermissions(current, updated);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
    expect(diff.hasChanges).toBe(false);
  });

  it("handles upgrading from no capabilities to some capabilities", () => {
    const current = createManifest([]);
    const updated = createManifest(["email:classify", "email:send"]);

    const diff = comparePermissions(current, updated);

    expect(diff.added).toHaveLength(2);
    expect(diff.removed).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
    expect(diff.hasChanges).toBe(true);
  });

  it("handles downgrading from some capabilities to no capabilities", () => {
    const current = createManifest(["email:classify", "email:send"]);
    const updated = createManifest([]);

    const diff = comparePermissions(current, updated);

    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(2);
    expect(diff.unchanged).toHaveLength(0);
    expect(diff.hasChanges).toBe(true);
  });

  it("handles unknown capabilities with descriptive messages", () => {
    const current = createManifest(["unknown:capability"]);
    const updated = createManifest(["another:unknown"]);

    const diff = comparePermissions(current, updated);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].name).toBe("another:unknown");
    expect(diff.added[0].description).toBe(
      "Unknown capability: another:unknown",
    );

    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].name).toBe("unknown:capability");
    expect(diff.removed[0].description).toBe(
      "Unknown capability: unknown:capability",
    );

    expect(diff.hasChanges).toBe(true);
  });

  it("sorts capabilities alphabetically by name", () => {
    const current = createManifest([]);
    const updated = createManifest([
      "email:send",
      "automation:rule",
      "calendar:write",
      "email:classify",
    ]);

    const diff = comparePermissions(current, updated);

    expect(diff.added.map((c) => c.name)).toEqual([
      "automation:rule",
      "calendar:write",
      "email:classify",
      "email:send",
    ]);
  });

  it("includes descriptions from risk-levels mapping", () => {
    const current = createManifest([]);
    const updated = createManifest([
      "email:classify",
      "email:send",
      "calendar:read",
    ]);

    const diff = comparePermissions(current, updated);

    const classifyDesc = diff.added.find(
      (c) => c.name === "email:classify",
    )?.description;
    const sendDesc = diff.added.find(
      (c) => c.name === "email:send",
    )?.description;
    const calendarDesc = diff.added.find(
      (c) => c.name === "calendar:read",
    )?.description;

    expect(classifyDesc).toBe("Classify and label emails");
    expect(sendDesc).toBe("Send emails on your behalf");
    expect(calendarDesc).toBe("Read your calendar events");
  });
});

describe("formatPermissionChangeSummary", () => {
  it("formats summary with only added permissions", () => {
    const diff: PermissionDiff = {
      added: [
        { name: "email:send", description: "Send emails" },
        { name: "email:modify", description: "Modify emails" },
      ],
      removed: [],
      unchanged: [],
      hasChanges: true,
    };

    expect(formatPermissionChangeSummary(diff)).toBe("2 new permissions");
  });

  it("formats summary with only removed permissions", () => {
    const diff: PermissionDiff = {
      added: [],
      removed: [{ name: "email:send", description: "Send emails" }],
      unchanged: [],
      hasChanges: true,
    };

    expect(formatPermissionChangeSummary(diff)).toBe("1 removed");
  });

  it("formats summary with both added and removed permissions", () => {
    const diff: PermissionDiff = {
      added: [
        { name: "email:send", description: "Send emails" },
        { name: "email:modify", description: "Modify emails" },
      ],
      removed: [{ name: "calendar:read", description: "Read calendar" }],
      unchanged: [],
      hasChanges: true,
    };

    expect(formatPermissionChangeSummary(diff)).toBe(
      "2 new permissions, 1 removed",
    );
  });

  it("formats summary with no changes", () => {
    const diff: PermissionDiff = {
      added: [],
      removed: [],
      unchanged: [{ name: "email:classify", description: "Classify emails" }],
      hasChanges: false,
    };

    expect(formatPermissionChangeSummary(diff)).toBe("No permission changes");
  });

  it("uses singular form for single permission", () => {
    const diff: PermissionDiff = {
      added: [{ name: "email:send", description: "Send emails" }],
      removed: [],
      unchanged: [],
      hasChanges: true,
    };

    expect(formatPermissionChangeSummary(diff)).toBe("1 new permission");
  });

  it("uses plural form for multiple permissions", () => {
    const diff: PermissionDiff = {
      added: [],
      removed: [
        { name: "email:send", description: "Send emails" },
        { name: "email:modify", description: "Modify emails" },
        { name: "calendar:write", description: "Write calendar" },
      ],
      unchanged: [],
      hasChanges: true,
    };

    expect(formatPermissionChangeSummary(diff)).toBe("3 removed");
  });
});
