/**
 * Derived Permissions
 *
 * Automatically derives data permissions from declared capabilities.
 * This simplifies plugin.json - developers only declare what they want to DO,
 * and the system figures out what data access they NEED.
 *
 * Mapping rationale:
 * - email:classify → metadata (classify based on subject, from, snippet)
 * - email:draft → full (need body context for reply drafts)
 * - email:send → full (composing emails often needs body context)
 * - email:signal → metadata (signals based on headers/metadata)
 * - email:trigger → metadata (trigger matching on metadata patterns)
 * - email:modify → metadata (labeling/archiving doesn't need body)
 * - automation:rule → full (rules often analyze body content)
 * - followup:detect → full (followup detection needs body analysis)
 * - calendar:* → calendar read/write as appropriate
 * - schedule:cron → no implicit email/calendar access
 */

import type {
  PluginCapability,
  CalendarPermission,
} from "@/packages/plugin-sdk/src/schemas/plugin-manifest";

// Re-export CalendarPermission from SDK for convenience
export type { CalendarPermission };

export type EmailPermissionTier = "none" | "metadata" | "full";

export interface DerivedPermissions {
  email: EmailPermissionTier;
  calendar: CalendarPermission[];
}

/**
 * Capabilities that require full email body access.
 * These capabilities need to analyze or respond to email content.
 */
const CAPABILITIES_REQUIRING_FULL_EMAIL: PluginCapability[] = [
  "email:draft",
  "email:send",
  "automation:rule",
  "followup:detect",
];

/**
 * Capabilities that require email metadata access (but not body).
 * These capabilities work with headers, subject, from, snippet.
 */
const CAPABILITIES_REQUIRING_METADATA_EMAIL: PluginCapability[] = [
  "email:classify",
  "email:signal",
  "email:trigger",
  "email:modify",
];

/**
 * Capabilities that require calendar read access.
 */
const CAPABILITIES_REQUIRING_CALENDAR_READ: PluginCapability[] = [
  "calendar:read",
  "calendar:list",
  "calendar:write", // write implies read
];

/**
 * Capabilities that require calendar write access.
 */
const CAPABILITIES_REQUIRING_CALENDAR_WRITE: PluginCapability[] = [
  "calendar:write",
];

/**
 * Derives data permissions from declared capabilities.
 *
 * This eliminates the need for explicit permissions in plugin.json.
 * The highest permission level wins when multiple capabilities are declared.
 *
 * @param capabilities - Array of declared capabilities
 * @returns Derived permissions object
 *
 * @example
 * ```typescript
 * // Plugin with email:classify capability
 * derivePermissionsFromCapabilities(['email:classify'])
 * // Returns: { email: 'metadata', calendar: [] }
 *
 * // Plugin with email:draft and email:classify
 * derivePermissionsFromCapabilities(['email:draft', 'email:classify'])
 * // Returns: { email: 'full', calendar: [] } // full wins over metadata
 *
 * // Plugin with calendar:write
 * derivePermissionsFromCapabilities(['calendar:write'])
 * // Returns: { email: 'none', calendar: ['read', 'write'] }
 * ```
 */
export function derivePermissionsFromCapabilities(
  capabilities: PluginCapability[],
): DerivedPermissions {
  // determine email permission tier (highest wins)
  let emailTier: EmailPermissionTier = "none";

  const needsFullEmail = capabilities.some((cap) =>
    CAPABILITIES_REQUIRING_FULL_EMAIL.includes(cap),
  );
  const needsMetadataEmail = capabilities.some((cap) =>
    CAPABILITIES_REQUIRING_METADATA_EMAIL.includes(cap),
  );

  if (needsFullEmail) {
    emailTier = "full";
  } else if (needsMetadataEmail) {
    emailTier = "metadata";
  }

  // determine calendar permissions
  const calendarPermissions: CalendarPermission[] = [];

  const needsCalendarRead = capabilities.some((cap) =>
    CAPABILITIES_REQUIRING_CALENDAR_READ.includes(cap),
  );
  const needsCalendarWrite = capabilities.some((cap) =>
    CAPABILITIES_REQUIRING_CALENDAR_WRITE.includes(cap),
  );

  if (needsCalendarRead) {
    calendarPermissions.push("read");
  }
  if (needsCalendarWrite) {
    calendarPermissions.push("write");
  }

  return {
    email: emailTier,
    calendar: calendarPermissions,
  };
}

/**
 * Gets a human-readable description of what data access a capability implies.
 * Useful for UI to explain permissions to users.
 */
export function getCapabilityDataAccessDescription(
  capability: PluginCapability,
): string {
  if (CAPABILITIES_REQUIRING_FULL_EMAIL.includes(capability)) {
    return "Full email access (subject, sender, body)";
  }
  if (CAPABILITIES_REQUIRING_METADATA_EMAIL.includes(capability)) {
    return "Email metadata only (subject, sender, snippet)";
  }
  if (CAPABILITIES_REQUIRING_CALENDAR_WRITE.includes(capability)) {
    return "Calendar read and write access";
  }
  if (CAPABILITIES_REQUIRING_CALENDAR_READ.includes(capability)) {
    return "Calendar read access";
  }
  return "No special data access";
}

/**
 * Gets the highest email permission tier from an array of capabilities.
 * Convenience function for quick checks.
 */
export function getEmailPermissionTier(
  capabilities: PluginCapability[],
): EmailPermissionTier {
  return derivePermissionsFromCapabilities(capabilities).email;
}

/**
 * Checks if capabilities require calendar access.
 */
export function requiresCalendarAccess(
  capabilities: PluginCapability[],
): boolean {
  return derivePermissionsFromCapabilities(capabilities).calendar.length > 0;
}
