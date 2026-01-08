/**
 * Permission difference detection for plugin updates.
 *
 * Compares capabilities between current and updated plugin versions to help
 * users understand what permissions changed during an update.
 */

import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import { getCapabilityInfo } from "./risk-levels";

/**
 * Capability information with human-readable name and description.
 */
export interface CapabilityDetail {
  name: string;
  description: string;
}

/**
 * Result of comparing capabilities between two plugin versions.
 */
export interface PermissionDiff {
  /** Capabilities added in the updated version */
  added: CapabilityDetail[];
  /** Capabilities removed in the updated version */
  removed: CapabilityDetail[];
  /** Capabilities present in both versions */
  unchanged: CapabilityDetail[];
  /** Whether there are any changes (added or removed capabilities) */
  hasChanges: boolean;
}

/**
 * Compare capabilities between two plugin manifests.
 *
 * Analyzes the difference in capabilities between a current plugin version
 * and an updated version, returning detailed information about what changed.
 *
 * @param current - The current/installed plugin manifest
 * @param updated - The updated plugin manifest
 * @returns Detailed breakdown of capability changes
 *
 * @example
 * ```typescript
 * const diff = comparePermissions(currentManifest, updatedManifest);
 * if (diff.hasChanges) {
 *   console.log('New permissions:', diff.added);
 *   console.log('Removed permissions:', diff.removed);
 * }
 * ```
 */
export function comparePermissions(
  current: PluginManifest,
  updated: PluginManifest,
): PermissionDiff {
  const currentCapabilities = new Set(current.capabilities ?? []);
  const updatedCapabilities = new Set(updated.capabilities ?? []);

  const added: CapabilityDetail[] = [];
  const removed: CapabilityDetail[] = [];
  const unchanged: CapabilityDetail[] = [];

  // find added capabilities (in updated but not in current)
  for (const capability of updatedCapabilities) {
    if (!currentCapabilities.has(capability)) {
      const info = getCapabilityInfo(capability);
      added.push({
        name: capability,
        description: info.description,
      });
    }
  }

  // find removed capabilities (in current but not in updated)
  for (const capability of currentCapabilities) {
    if (!updatedCapabilities.has(capability)) {
      const info = getCapabilityInfo(capability);
      removed.push({
        name: capability,
        description: info.description,
      });
    }
  }

  // find unchanged capabilities (in both)
  for (const capability of currentCapabilities) {
    if (updatedCapabilities.has(capability)) {
      const info = getCapabilityInfo(capability);
      unchanged.push({
        name: capability,
        description: info.description,
      });
    }
  }

  // sort by capability name for consistent display
  const sortByName = (a: CapabilityDetail, b: CapabilityDetail) =>
    a.name.localeCompare(b.name);
  added.sort(sortByName);
  removed.sort(sortByName);
  unchanged.sort(sortByName);

  return {
    added,
    removed,
    unchanged,
    hasChanges: added.length > 0 || removed.length > 0,
  };
}

/**
 * Format permission changes for display in the UI.
 * Provides a concise summary suitable for showing in dialogs or notifications.
 *
 * @param diff - The permission diff result
 * @returns Human-readable summary string
 *
 * @example
 * ```typescript
 * const summary = formatPermissionChangeSummary(diff);
 * // Returns: "2 new permissions, 1 removed"
 * ```
 */
export function formatPermissionChangeSummary(diff: PermissionDiff): string {
  const parts: string[] = [];

  if (diff.added.length > 0) {
    parts.push(
      `${diff.added.length} new permission${diff.added.length !== 1 ? "s" : ""}`,
    );
  }

  if (diff.removed.length > 0) {
    parts.push(`${diff.removed.length} removed`);
  }

  if (parts.length === 0) {
    return "No permission changes";
  }

  return parts.join(", ");
}
