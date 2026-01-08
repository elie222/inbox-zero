/**
 * Trust registry loader and capability gating for the plugin system.
 *
 * The Inbox Zero team maintains a trust registry that assigns trust levels to plugins.
 * This module loads the registry and enforces capability access based on trust levels.
 */

import trustRegistry from "../../config/plugin-trust-registry.json" with {
  type: "json",
};

export type TrustLevel = "verified" | "community" | "unverified";

interface PluginTrustEntry {
  level: TrustLevel;
  allowedCapabilities: string[];
}

interface TrustRegistry {
  version: string;
  lastUpdated: string;
  plugins: Record<string, PluginTrustEntry>;
  defaults: {
    unregistered: PluginTrustEntry;
  };
}

/**
 * Capability requirements by trust level.
 * Each capability maps to an array of trust levels that can access it.
 */
export const CAPABILITY_REQUIREMENTS: Record<string, TrustLevel[]> = {
  "email:classify": ["verified", "community", "unverified"],
  "email:draft": ["verified", "community"],
  "email:send": ["verified"],
  "email:modify": ["verified"],
  "email:trigger": ["verified", "community"],
  "email:signal": ["verified", "community"],
  "schedule:cron": ["verified", "community"],
  "automation:rule": ["verified"],
  "followup:detect": ["verified", "community"],
  "calendar:read": ["verified", "community"],
  "calendar:write": ["verified"],
  "calendar:list": ["verified", "community"],
};

/**
 * All known capabilities in the plugin system.
 */
export const ALL_CAPABILITIES = Object.keys(CAPABILITY_REQUIREMENTS);

/**
 * Get the loaded trust registry with type safety.
 */
function getRegistry(): TrustRegistry {
  return trustRegistry as TrustRegistry;
}

/**
 * Get the trust level for a plugin.
 * Returns 'unverified' if the plugin is not in the registry.
 */
export function getTrustLevel(pluginId: string): TrustLevel {
  const registry = getRegistry();
  const pluginEntry = registry.plugins[pluginId];

  if (pluginEntry) {
    return pluginEntry.level;
  }

  return registry.defaults.unregistered.level;
}

/**
 * Get the explicitly allowed capabilities for a plugin from the registry.
 * This returns the capabilities the Inbox Zero team has specifically granted.
 * Returns undefined if the plugin is not registered (use defaults).
 */
export function getRegistryCapabilities(
  pluginId: string,
): string[] | undefined {
  const registry = getRegistry();
  const pluginEntry = registry.plugins[pluginId];

  if (pluginEntry) {
    return pluginEntry.allowedCapabilities;
  }

  return undefined;
}

/**
 * Get the default capabilities for unregistered plugins.
 */
export function getDefaultCapabilities(): string[] {
  const registry = getRegistry();
  return registry.defaults.unregistered.allowedCapabilities;
}

/**
 * Check if a trust level can access a capability based on system-wide requirements.
 */
export function trustLevelCanUseCapability(
  trustLevel: TrustLevel,
  capability: string,
): boolean {
  const allowedLevels = CAPABILITY_REQUIREMENTS[capability];

  if (!allowedLevels) {
    // unknown capability - deny by default
    return false;
  }

  return allowedLevels.includes(trustLevel);
}

/**
 * Check if a plugin can use a specific capability.
 * This checks both:
 * 1. The plugin's trust level allows the capability (system-wide rules)
 * 2. The plugin has been granted the capability (registry override)
 */
export function canUseCapability(
  pluginId: string,
  capability: string,
): boolean {
  const trustLevel = getTrustLevel(pluginId);
  const registryCapabilities = getRegistryCapabilities(pluginId);

  // first check system-wide trust level requirements
  if (!trustLevelCanUseCapability(trustLevel, capability)) {
    return false;
  }

  // if plugin is registered with specific capabilities, check against those
  if (registryCapabilities !== undefined) {
    return registryCapabilities.includes(capability);
  }

  // unregistered plugin - check against default capabilities
  const defaultCapabilities = getDefaultCapabilities();
  return defaultCapabilities.includes(capability);
}

/**
 * Filter requested capabilities to only those the plugin can actually use.
 * Returns the intersection of:
 * - What the plugin requests
 * - What the plugin's trust level allows (system rules)
 * - What the registry explicitly grants (or defaults for unregistered)
 */
export function getEffectiveCapabilities(
  pluginId: string,
  requestedCapabilities: string[],
): string[] {
  return requestedCapabilities.filter((capability) =>
    canUseCapability(pluginId, capability),
  );
}

/**
 * Get all capabilities a plugin could potentially use based on its trust level,
 * regardless of what it requests.
 */
export function getMaxCapabilitiesForTrustLevel(
  trustLevel: TrustLevel,
): string[] {
  return ALL_CAPABILITIES.filter((capability) =>
    trustLevelCanUseCapability(trustLevel, capability),
  );
}

/**
 * Get a human-readable description of a trust level.
 */
export function getTrustLevelDescription(trustLevel: TrustLevel): string {
  switch (trustLevel) {
    case "verified":
      return "Code reviewed by Inbox Zero team - all capabilities available";
    case "community":
      return "Community reviewed with basic checks - limited capabilities";
    case "unverified":
      return "No review - install at your own risk - minimal capabilities";
  }
}

/**
 * Get capabilities that would be blocked for a plugin if it requested them.
 * Useful for showing users what capabilities are restricted.
 */
export function getBlockedCapabilities(
  pluginId: string,
  requestedCapabilities: string[],
): string[] {
  return requestedCapabilities.filter(
    (capability) => !canUseCapability(pluginId, capability),
  );
}

/**
 * Validate that a plugin manifest's capabilities are consistent with its trust level.
 * Returns validation errors if any capabilities would be blocked.
 */
export function validatePluginCapabilities(
  pluginId: string,
  requestedCapabilities: string[],
): { valid: boolean; blockedCapabilities: string[]; trustLevel: TrustLevel } {
  const trustLevel = getTrustLevel(pluginId);
  const blockedCapabilities = getBlockedCapabilities(
    pluginId,
    requestedCapabilities,
  );

  return {
    valid: blockedCapabilities.length === 0,
    blockedCapabilities,
    trustLevel,
  };
}
