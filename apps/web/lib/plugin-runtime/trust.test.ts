/**
 * Tests for plugin trust level and capability enforcement system.
 *
 * The trust system gates which capabilities plugins can use based on their
 * trust level (verified, community, unverified) and registry entries.
 */

import { describe, it, expect } from "vitest";
import {
  getTrustLevel,
  getRegistryCapabilities,
  getDefaultCapabilities,
  trustLevelCanUseCapability,
  canUseCapability,
  getEffectiveCapabilities,
  getMaxCapabilitiesForTrustLevel,
  getTrustLevelDescription,
  getBlockedCapabilities,
  validatePluginCapabilities,
  CAPABILITY_REQUIREMENTS,
  ALL_CAPABILITIES,
} from "./trust";

describe("Trust Level System", () => {
  describe("CAPABILITY_REQUIREMENTS", () => {
    it("defines requirements for all known capabilities", () => {
      expect(ALL_CAPABILITIES).toContain("email:classify");
      expect(ALL_CAPABILITIES).toContain("email:send");
      expect(ALL_CAPABILITIES).toContain("email:modify");
      expect(ALL_CAPABILITIES).toContain("calendar:write");
    });

    it("allows email:classify for all trust levels", () => {
      expect(CAPABILITY_REQUIREMENTS["email:classify"]).toEqual([
        "verified",
        "community",
        "unverified",
      ]);
    });

    it("restricts email:send to verified only", () => {
      expect(CAPABILITY_REQUIREMENTS["email:send"]).toEqual(["verified"]);
    });

    it("restricts email:modify to verified only", () => {
      expect(CAPABILITY_REQUIREMENTS["email:modify"]).toEqual(["verified"]);
    });

    it("restricts automation:rule to verified only", () => {
      expect(CAPABILITY_REQUIREMENTS["automation:rule"]).toEqual(["verified"]);
    });

    it("allows email:draft for verified and community", () => {
      expect(CAPABILITY_REQUIREMENTS["email:draft"]).toEqual([
        "verified",
        "community",
      ]);
    });

    it("allows schedule:cron for verified and community", () => {
      expect(CAPABILITY_REQUIREMENTS["schedule:cron"]).toEqual([
        "verified",
        "community",
      ]);
    });
  });

  describe("trustLevelCanUseCapability", () => {
    it("allows verified to use all capabilities", () => {
      for (const capability of ALL_CAPABILITIES) {
        expect(trustLevelCanUseCapability("verified", capability)).toBe(true);
      }
    });

    it("allows community to use limited capabilities", () => {
      expect(trustLevelCanUseCapability("community", "email:classify")).toBe(
        true,
      );
      expect(trustLevelCanUseCapability("community", "email:draft")).toBe(true);
      expect(trustLevelCanUseCapability("community", "schedule:cron")).toBe(
        true,
      );
    });

    it("blocks community from high-risk capabilities", () => {
      expect(trustLevelCanUseCapability("community", "email:send")).toBe(false);
      expect(trustLevelCanUseCapability("community", "email:modify")).toBe(
        false,
      );
      expect(trustLevelCanUseCapability("community", "automation:rule")).toBe(
        false,
      );
      expect(trustLevelCanUseCapability("community", "calendar:write")).toBe(
        false,
      );
    });

    it("restricts unverified to minimal capabilities", () => {
      expect(trustLevelCanUseCapability("unverified", "email:classify")).toBe(
        true,
      );
      expect(trustLevelCanUseCapability("unverified", "email:draft")).toBe(
        false,
      );
      expect(trustLevelCanUseCapability("unverified", "email:send")).toBe(
        false,
      );
      expect(trustLevelCanUseCapability("unverified", "schedule:cron")).toBe(
        false,
      );
    });

    it("denies unknown capabilities", () => {
      expect(trustLevelCanUseCapability("verified", "unknown:capability")).toBe(
        false,
      );
      expect(
        trustLevelCanUseCapability("community", "made-up:permission"),
      ).toBe(false);
    });
  });

  describe("getTrustLevel", () => {
    it("returns unverified for unregistered plugins", () => {
      expect(getTrustLevel("some-random-plugin")).toBe("unverified");
    });

    it("returns unverified for unknown plugins", () => {
      expect(getTrustLevel("definitely-not-in-registry")).toBe("unverified");
    });
  });

  describe("getDefaultCapabilities", () => {
    it("returns minimal capabilities for unregistered plugins", () => {
      const defaultCaps = getDefaultCapabilities();
      expect(defaultCaps).toContain("email:classify");
      expect(defaultCaps).not.toContain("email:send");
      expect(defaultCaps).not.toContain("email:modify");
    });
  });

  describe("getRegistryCapabilities", () => {
    it("returns undefined for unregistered plugins", () => {
      expect(getRegistryCapabilities("not-in-registry")).toBeUndefined();
    });
  });

  describe("canUseCapability", () => {
    it("allows unregistered plugins to use email:classify", () => {
      expect(canUseCapability("random-plugin", "email:classify")).toBe(true);
    });

    it("blocks unregistered plugins from email:send", () => {
      expect(canUseCapability("random-plugin", "email:send")).toBe(false);
    });

    it("blocks unregistered plugins from email:modify", () => {
      expect(canUseCapability("random-plugin", "email:modify")).toBe(false);
    });

    it("blocks unregistered plugins from calendar:write", () => {
      expect(canUseCapability("random-plugin", "calendar:write")).toBe(false);
    });
  });

  describe("getEffectiveCapabilities", () => {
    it("filters requested capabilities to allowed ones", () => {
      const requested = [
        "email:classify",
        "email:send",
        "email:modify",
        "schedule:cron",
      ];
      const effective = getEffectiveCapabilities("random-plugin", requested);

      expect(effective).toContain("email:classify");
      expect(effective).not.toContain("email:send");
      expect(effective).not.toContain("email:modify");
      expect(effective).not.toContain("schedule:cron");
    });

    it("returns empty array when no capabilities are allowed", () => {
      const requested = ["email:send", "email:modify", "automation:rule"];
      const effective = getEffectiveCapabilities("random-plugin", requested);

      expect(effective).toEqual([]);
    });

    it("returns all requested if all are allowed", () => {
      const requested = ["email:classify"];
      const effective = getEffectiveCapabilities("random-plugin", requested);

      expect(effective).toEqual(["email:classify"]);
    });
  });

  describe("getMaxCapabilitiesForTrustLevel", () => {
    it("returns all capabilities for verified", () => {
      const maxCaps = getMaxCapabilitiesForTrustLevel("verified");
      expect(maxCaps).toEqual(ALL_CAPABILITIES);
    });

    it("returns subset for community", () => {
      const maxCaps = getMaxCapabilitiesForTrustLevel("community");
      expect(maxCaps).toContain("email:classify");
      expect(maxCaps).toContain("email:draft");
      expect(maxCaps).not.toContain("email:send");
      expect(maxCaps).not.toContain("email:modify");
    });

    it("returns minimal capabilities for unverified", () => {
      const maxCaps = getMaxCapabilitiesForTrustLevel("unverified");
      expect(maxCaps).toEqual(["email:classify"]);
    });
  });

  describe("getTrustLevelDescription", () => {
    it("describes verified level", () => {
      const desc = getTrustLevelDescription("verified");
      expect(desc).toContain("Inbox Zero team");
      expect(desc).toContain("all capabilities");
    });

    it("describes community level", () => {
      const desc = getTrustLevelDescription("community");
      expect(desc).toContain("Community");
      expect(desc).toContain("limited");
    });

    it("describes unverified level", () => {
      const desc = getTrustLevelDescription("unverified");
      expect(desc).toContain("No review");
      expect(desc).toContain("risk");
    });
  });

  describe("getBlockedCapabilities", () => {
    it("returns capabilities that would be blocked", () => {
      const requested = ["email:classify", "email:send", "email:modify"];
      const blocked = getBlockedCapabilities("random-plugin", requested);

      expect(blocked).toContain("email:send");
      expect(blocked).toContain("email:modify");
      expect(blocked).not.toContain("email:classify");
    });

    it("returns empty array if nothing blocked", () => {
      const requested = ["email:classify"];
      const blocked = getBlockedCapabilities("random-plugin", requested);

      expect(blocked).toEqual([]);
    });
  });

  describe("validatePluginCapabilities", () => {
    it("returns valid for allowed capabilities", () => {
      const result = validatePluginCapabilities("random-plugin", [
        "email:classify",
      ]);

      expect(result.valid).toBe(true);
      expect(result.blockedCapabilities).toEqual([]);
      expect(result.trustLevel).toBe("unverified");
    });

    it("returns invalid for blocked capabilities", () => {
      const result = validatePluginCapabilities("random-plugin", [
        "email:classify",
        "email:send",
        "automation:rule",
      ]);

      expect(result.valid).toBe(false);
      expect(result.blockedCapabilities).toContain("email:send");
      expect(result.blockedCapabilities).toContain("automation:rule");
      expect(result.trustLevel).toBe("unverified");
    });

    it("includes trust level in result", () => {
      const result = validatePluginCapabilities("any-plugin", [
        "email:classify",
      ]);
      expect(result.trustLevel).toBe("unverified");
    });
  });
});

describe("Trust Level Hierarchy", () => {
  it("verified > community > unverified in capability access", () => {
    const verifiedCaps = getMaxCapabilitiesForTrustLevel("verified");
    const communityCaps = getMaxCapabilitiesForTrustLevel("community");
    const unverifiedCaps = getMaxCapabilitiesForTrustLevel("unverified");

    expect(verifiedCaps.length).toBeGreaterThan(communityCaps.length);
    expect(communityCaps.length).toBeGreaterThan(unverifiedCaps.length);
  });

  it("unverified capabilities are subset of community", () => {
    const communityCaps = new Set(getMaxCapabilitiesForTrustLevel("community"));
    const unverifiedCaps = getMaxCapabilitiesForTrustLevel("unverified");

    for (const cap of unverifiedCaps) {
      expect(communityCaps.has(cap)).toBe(true);
    }
  });

  it("community capabilities are subset of verified", () => {
    const verifiedCaps = new Set(getMaxCapabilitiesForTrustLevel("verified"));
    const communityCaps = getMaxCapabilitiesForTrustLevel("community");

    for (const cap of communityCaps) {
      expect(verifiedCaps.has(cap)).toBe(true);
    }
  });
});

describe("Security Boundary Tests", () => {
  describe("High-risk capability restrictions", () => {
    const highRiskCapabilities = [
      "email:send",
      "email:modify",
      "automation:rule",
      "calendar:write",
    ];

    it("blocks all high-risk capabilities for unverified plugins", () => {
      for (const cap of highRiskCapabilities) {
        expect(canUseCapability("untrusted-plugin", cap)).toBe(false);
      }
    });

    it("blocks high-risk capabilities for community plugins", () => {
      for (const cap of highRiskCapabilities) {
        expect(trustLevelCanUseCapability("community", cap)).toBe(false);
      }
    });
  });

  describe("Defense in depth", () => {
    it("unknown capabilities are denied by default", () => {
      expect(trustLevelCanUseCapability("verified", "unknown:cap")).toBe(false);
      expect(canUseCapability("any-plugin", "fake:capability")).toBe(false);
    });

    it("unregistered plugins get minimal capabilities", () => {
      const effective = getEffectiveCapabilities("malicious-plugin", [
        "email:classify",
        "email:send",
        "email:modify",
        "calendar:write",
        "automation:rule",
      ]);

      expect(effective).toEqual(["email:classify"]);
    });
  });
});
