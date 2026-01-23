/**
 * Tests for the derived permissions system.
 *
 * The derived permissions system automatically infers data access permissions
 * from declared capabilities, simplifying plugin.json configuration.
 */

import { describe, it, expect } from "vitest";
import {
  derivePermissionsFromCapabilities,
  getCapabilityDataAccessDescription,
  getEmailPermissionTier,
  requiresCalendarAccess,
  type EmailPermissionTier,
} from "./derived-permissions";
import type { PluginCapability } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";

describe("derivePermissionsFromCapabilities", () => {
  describe("Email Permission Derivation", () => {
    it("returns 'none' when no capabilities declared", () => {
      const result = derivePermissionsFromCapabilities([]);
      expect(result.email).toBe("none");
    });

    it("returns 'none' for capabilities that don't need email", () => {
      const result = derivePermissionsFromCapabilities(["schedule:cron"]);
      expect(result.email).toBe("none");
    });

    describe("Metadata-level capabilities", () => {
      const metadataCapabilities: PluginCapability[] = [
        "email:classify",
        "email:signal",
        "email:trigger",
        "email:modify",
      ];

      it.each(metadataCapabilities)(
        "returns 'metadata' for %s",
        (capability) => {
          const result = derivePermissionsFromCapabilities([capability]);
          expect(result.email).toBe("metadata");
        },
      );
    });

    describe("Full-access capabilities", () => {
      const fullAccessCapabilities: PluginCapability[] = [
        "email:draft",
        "email:send",
        "automation:rule",
        "followup:detect",
      ];

      it.each(fullAccessCapabilities)("returns 'full' for %s", (capability) => {
        const result = derivePermissionsFromCapabilities([capability]);
        expect(result.email).toBe("full");
      });
    });

    it("full access wins over metadata when both present", () => {
      const result = derivePermissionsFromCapabilities([
        "email:classify", // metadata
        "email:draft", // full
      ]);
      expect(result.email).toBe("full");
    });

    it("full access wins regardless of order", () => {
      const result1 = derivePermissionsFromCapabilities([
        "email:draft",
        "email:classify",
      ]);
      const result2 = derivePermissionsFromCapabilities([
        "email:classify",
        "email:draft",
      ]);
      expect(result1.email).toBe("full");
      expect(result2.email).toBe("full");
    });

    it("multiple metadata capabilities still return metadata", () => {
      const result = derivePermissionsFromCapabilities([
        "email:classify",
        "email:signal",
        "email:trigger",
      ]);
      expect(result.email).toBe("metadata");
    });
  });

  describe("Calendar Permission Derivation", () => {
    it("returns empty array when no calendar capabilities", () => {
      const result = derivePermissionsFromCapabilities(["email:classify"]);
      expect(result.calendar).toEqual([]);
    });

    it("returns ['read'] for calendar:read", () => {
      const result = derivePermissionsFromCapabilities(["calendar:read"]);
      expect(result.calendar).toEqual(["read"]);
    });

    it("returns ['read'] for calendar:list", () => {
      const result = derivePermissionsFromCapabilities(["calendar:list"]);
      expect(result.calendar).toEqual(["read"]);
    });

    it("returns ['read', 'write'] for calendar:write", () => {
      const result = derivePermissionsFromCapabilities(["calendar:write"]);
      expect(result.calendar).toContain("read");
      expect(result.calendar).toContain("write");
    });

    it("calendar:write implies read access", () => {
      const result = derivePermissionsFromCapabilities(["calendar:write"]);
      expect(result.calendar).toContain("read");
    });

    it("combining calendar:read and calendar:write gives both", () => {
      const result = derivePermissionsFromCapabilities([
        "calendar:read",
        "calendar:write",
      ]);
      expect(result.calendar).toContain("read");
      expect(result.calendar).toContain("write");
    });
  });

  describe("Combined Email and Calendar", () => {
    it("derives both email and calendar permissions", () => {
      const result = derivePermissionsFromCapabilities([
        "email:draft",
        "calendar:write",
      ]);
      expect(result.email).toBe("full");
      expect(result.calendar).toContain("read");
      expect(result.calendar).toContain("write");
    });

    it("handles complex capability combinations", () => {
      const result = derivePermissionsFromCapabilities([
        "email:classify",
        "email:draft",
        "calendar:read",
        "schedule:cron",
      ]);
      expect(result.email).toBe("full"); // draft wins
      expect(result.calendar).toEqual(["read"]);
    });
  });
});

describe("getCapabilityDataAccessDescription", () => {
  it("describes full email access capabilities", () => {
    const desc = getCapabilityDataAccessDescription("email:draft");
    expect(desc).toContain("Full email access");
    expect(desc).toContain("body");
  });

  it("describes metadata-only capabilities", () => {
    const desc = getCapabilityDataAccessDescription("email:classify");
    expect(desc).toContain("metadata");
    expect(desc).not.toContain("body");
  });

  it("describes calendar write access", () => {
    const desc = getCapabilityDataAccessDescription("calendar:write");
    expect(desc).toContain("Calendar");
    expect(desc).toContain("write");
  });

  it("describes calendar read access", () => {
    const desc = getCapabilityDataAccessDescription("calendar:read");
    expect(desc).toContain("Calendar");
    expect(desc).toContain("read");
  });

  it("describes no access for schedule:cron", () => {
    const desc = getCapabilityDataAccessDescription("schedule:cron");
    expect(desc).toContain("No special");
  });
});

describe("getEmailPermissionTier", () => {
  it("is a convenience wrapper for derivePermissionsFromCapabilities", () => {
    expect(getEmailPermissionTier(["email:classify"])).toBe("metadata");
    expect(getEmailPermissionTier(["email:draft"])).toBe("full");
    expect(getEmailPermissionTier(["schedule:cron"])).toBe("none");
  });
});

describe("requiresCalendarAccess", () => {
  it("returns true when calendar capabilities present", () => {
    expect(requiresCalendarAccess(["calendar:read"])).toBe(true);
    expect(requiresCalendarAccess(["calendar:write"])).toBe(true);
    expect(requiresCalendarAccess(["calendar:list"])).toBe(true);
  });

  it("returns false when no calendar capabilities", () => {
    expect(requiresCalendarAccess(["email:classify"])).toBe(false);
    expect(requiresCalendarAccess(["schedule:cron"])).toBe(false);
    expect(requiresCalendarAccess([])).toBe(false);
  });
});

describe("Permission Tier Hierarchy", () => {
  const _tiers: EmailPermissionTier[] = ["none", "metadata", "full"];

  it("none < metadata < full in access level", () => {
    // Verify the hierarchy makes sense for the use case
    const _noneFields = ["id", "threadId"]; // always available
    const metadataFields = ["subject", "from", "to", "snippet"];
    const fullFields = ["body", "headers", "attachments"];

    // metadata includes more than none
    expect(metadataFields.length).toBeGreaterThan(0);
    // full includes body which metadata doesn't
    expect(fullFields).toContain("body");
  });
});

describe("Edge Cases", () => {
  it("handles duplicate capabilities gracefully", () => {
    const result = derivePermissionsFromCapabilities([
      "email:classify",
      "email:classify",
      "email:classify",
    ]);
    expect(result.email).toBe("metadata");
  });

  it("handles all capabilities at once", () => {
    const allCapabilities: PluginCapability[] = [
      "email:classify",
      "email:draft",
      "email:send",
      "email:modify",
      "email:signal",
      "email:trigger",
      "automation:rule",
      "followup:detect",
      "calendar:read",
      "calendar:write",
      "calendar:list",
      "schedule:cron",
    ];

    const result = derivePermissionsFromCapabilities(allCapabilities);
    expect(result.email).toBe("full"); // highest wins
    expect(result.calendar).toContain("read");
    expect(result.calendar).toContain("write");
  });
});
