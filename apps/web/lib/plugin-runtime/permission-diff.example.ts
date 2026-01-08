/**
 * Example usage of permission-diff utility.
 * This demonstrates how to use the comparePermissions function to detect
 * permission changes when a plugin is updated.
 */

import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import {
  comparePermissions,
  formatPermissionChangeSummary,
} from "./permission-diff";

// example: plugin update adds new email sending capability
const currentVersion: PluginManifest = {
  id: "newsletter-assistant",
  name: "Newsletter Assistant",
  version: "1.0.0",
  inboxZero: { minVersion: "0.1.0" },
  capabilities: ["email:classify", "email:signal"],
  entry: "index.ts",
};

const updatedVersion: PluginManifest = {
  id: "newsletter-assistant",
  name: "Newsletter Assistant",
  version: "2.0.0",
  inboxZero: { minVersion: "0.1.0" },
  capabilities: ["email:classify", "email:signal", "email:send", "email:draft"],
  entry: "index.ts",
};

// compare permissions
const diff = comparePermissions(currentVersion, updatedVersion);

// display changes
console.log("Permission Changes:");
console.log("==================");

if (diff.hasChanges) {
  console.log(formatPermissionChangeSummary(diff));
  console.log();

  if (diff.added.length > 0) {
    console.log("New Permissions:");
    diff.added.forEach((cap) => {
      console.log(`  - ${cap.name}: ${cap.description}`);
    });
    console.log();
  }

  if (diff.removed.length > 0) {
    console.log("Removed Permissions:");
    diff.removed.forEach((cap) => {
      console.log(`  - ${cap.name}: ${cap.description}`);
    });
    console.log();
  }

  if (diff.unchanged.length > 0) {
    console.log("Unchanged Permissions:");
    diff.unchanged.forEach((cap) => {
      console.log(`  - ${cap.name}: ${cap.description}`);
    });
  }
} else {
  console.log("No permission changes detected");
}

/**
 * Example output:
 *
 * Permission Changes:
 * ==================
 * 2 new permissions
 *
 * New Permissions:
 *   - email:draft: Create draft emails
 *   - email:send: Send emails on your behalf
 *
 * Unchanged Permissions:
 *   - email:classify: Classify and label emails
 *   - email:signal: Emit signals when emails arrive
 */
