/**
 * Capability risk classification for the plugin system.
 *
 * This module categorizes plugin capabilities by their potential impact on user
 * privacy and security, providing information for informed consent during
 * plugin installation.
 *
 * Capabilities are classified as either:
 * - standard: Read-only access, classification, and basic operations
 * - elevated: Ability to take actions on behalf of the user
 */

import type {
  PluginManifest,
  PluginCapability,
} from "@/packages/plugin-sdk/src/schemas/plugin-manifest";

/**
 * Risk level for plugin capabilities.
 * - standard: Read-only access, classification, and basic operations
 * - elevated: Ability to take actions on behalf of the user
 */
export type CapabilityRisk = "standard" | "elevated";

/**
 * Overall danger classification for a plugin based on its capabilities.
 * - standard: Only standard-risk capabilities (read-only, classification)
 * - elevated: Contains elevated capabilities (can take actions)
 */
export type DangerLevel = "standard" | "elevated";

/**
 * Capability information including risk assessment and display metadata.
 */
export interface CapabilityInfo {
  risk: CapabilityRisk;
  description: string;
}

/**
 * Risk classification for all known capabilities.
 * Capabilities are mapped to their risk level and user-friendly description.
 */
export const CAPABILITY_RISK: Record<PluginCapability, CapabilityInfo> = {
  // standard - read-only, classification, basic operations
  "email:classify": {
    risk: "standard",
    description: "Classify and label emails",
  },
  "email:signal": {
    risk: "standard",
    description: "Emit signals when emails arrive",
  },
  "email:trigger": {
    risk: "standard",
    description: "Respond to email triggers",
  },
  "followup:detect": {
    risk: "standard",
    description: "Detect follow-up emails",
  },
  "calendar:list": {
    risk: "standard",
    description: "List your calendars",
  },
  "calendar:read": {
    risk: "standard",
    description: "Read your calendar events",
  },
  "schedule:cron": {
    risk: "standard",
    description: "Run scheduled tasks",
  },

  // elevated - can take actions on behalf of user
  "email:send": {
    risk: "elevated",
    description: "Send emails on your behalf",
  },
  "email:send_as": {
    risk: "elevated",
    description: "Send emails from a custom address variant",
  },
  "email:modify": {
    risk: "elevated",
    description: "Archive, label, and modify emails",
  },
  "email:draft": {
    risk: "elevated",
    description: "Create draft emails",
  },
  "automation:rule": {
    risk: "elevated",
    description: "Create automation rules",
  },
  "calendar:write": {
    risk: "elevated",
    description: "Create and modify calendar events",
  },
  "chat:tool": {
    risk: "standard",
    description: "Provide tools for AI chat interactions",
  },
  "chat:context": {
    risk: "standard",
    description: "Provide context for AI chat conversations",
  },
};

/**
 * Default capability info for unknown capabilities.
 * Treats unknown capabilities as elevated for safety.
 */
const UNKNOWN_CAPABILITY_INFO: CapabilityInfo = {
  risk: "elevated",
  description: "Unknown capability",
};

/**
 * Get the risk level for a single capability.
 *
 * @param capability - The capability string to classify
 * @returns The risk level (standard or elevated)
 */
export function getCapabilityRisk(capability: string): CapabilityRisk {
  return (
    CAPABILITY_RISK[capability as PluginCapability]?.risk ??
    UNKNOWN_CAPABILITY_INFO.risk
  );
}

/**
 * Get full information about a capability including risk level and description.
 *
 * @param capability - The capability string to look up
 * @returns Capability info object with risk and description
 */
export function getCapabilityInfo(capability: string): CapabilityInfo {
  return (
    CAPABILITY_RISK[capability as PluginCapability] ?? {
      ...UNKNOWN_CAPABILITY_INFO,
      description: `Unknown capability: ${capability}`,
    }
  );
}

/**
 * Calculate the overall danger level for a set of capabilities.
 * Returns elevated if any capability is elevated, otherwise standard.
 *
 * @param capabilities - Array of capability strings
 * @returns Overall danger level (standard or elevated)
 */
export function getDangerLevel(capabilities: string[]): DangerLevel {
  if (capabilities.length === 0) {
    return "standard";
  }

  const hasElevated = capabilities.some(
    (c) => getCapabilityRisk(c) === "elevated",
  );
  return hasElevated ? "elevated" : "standard";
}

/**
 * Check if any capability in the set is elevated.
 *
 * @param capabilities - Array of capability strings
 * @returns True if any capability is elevated
 */
export function hasElevatedCapabilities(capabilities: string[]): boolean {
  return capabilities.some((c) => getCapabilityRisk(c) === "elevated");
}

/**
 * Group capabilities by their risk level.
 *
 * @param capabilities - Array of capability strings
 * @returns Object with capabilities grouped by risk level
 */
export function groupCapabilitiesByRisk(capabilities: string[]): {
  standard: string[];
  elevated: string[];
} {
  const groups = {
    standard: [] as string[],
    elevated: [] as string[],
  };

  for (const capability of capabilities) {
    const risk = getCapabilityRisk(capability);
    groups[risk].push(capability);
  }

  return groups;
}

/**
 * Format a permission summary for display in the UI.
 * Provides all the information needed to render a permission consent dialog.
 *
 * @param manifest - The plugin manifest to summarize
 * @returns Summary with formatted capabilities and overall danger level
 */
export function formatPermissionSummary(manifest: PluginManifest): {
  capabilities: Array<{
    name: string;
    description: string;
    risk: CapabilityRisk;
  }>;
  dangerLevel: DangerLevel;
} {
  const capabilities = (manifest.capabilities ?? []).map((name) => {
    const info = getCapabilityInfo(name);
    return {
      name,
      description: info.description,
      risk: info.risk,
    };
  });

  // sort by risk level (elevated first, then standard)
  const riskOrder: Record<CapabilityRisk, number> = {
    elevated: 0,
    standard: 1,
  };
  capabilities.sort((a, b) => riskOrder[a.risk] - riskOrder[b.risk]);

  return {
    capabilities,
    dangerLevel: getDangerLevel(manifest.capabilities ?? []),
  };
}
