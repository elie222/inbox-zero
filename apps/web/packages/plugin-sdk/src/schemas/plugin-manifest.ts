import { z } from "zod";

/**
 * Semver regex pattern for version validation
 * Matches: 0.0.0, 1.2.3, 10.20.30, 0.0.0-alpha.1, 1.0.0-rc.1+build.123
 */
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * Valid plugin capabilities that determine which hooks are available
 */
export const pluginCapabilitySchema = z.enum([
  "email:classify",
  "email:draft",
  "email:send",
  "email:send_as",
  "email:signal",
  "email:trigger",
  "email:modify",
  "schedule:cron",
  "automation:rule",
  "followup:detect",
  "calendar:read",
  "calendar:write",
  "calendar:list",
  "chat:tool",
  "chat:context",
  "mcp:access", // Access user's connected MCP tools via LLM
  "mcp:expose", // Expose plugin's own MCP server to chat (verified only)
]);

export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;

/**
 * Email permission tiers - simplified access levels
 * - none: No email access (default)
 * - metadata: Access to subject, from, to, cc, date, snippet
 * - full: Access to metadata + body content
 */
export const emailPermissionTierSchema = z.enum(["none", "metadata", "full"]);

export type EmailPermissionTier = z.infer<typeof emailPermissionTierSchema>;

/**
 * Calendar permissions - read and/or write access
 */
export const calendarPermissionSchema = z.enum(["read", "write"]);

export type CalendarPermission = z.infer<typeof calendarPermissionSchema>;

/**
 * LLM tier determines which model class is used for the plugin
 * - default: Standard model for general use
 * - economy: Cheaper, faster model for simple tasks
 * - chat: Optimized for conversational interactions
 */
export const llmTierSchema = z.enum(["default", "economy", "chat"]);

export type LlmTier = z.infer<typeof llmTierSchema>;

/**
 * Permissions schema defining what data the plugin can access.
 *
 * @deprecated Permissions are now automatically derived from capabilities.
 * You no longer need to specify this field - the system will infer the
 * appropriate data access from your declared capabilities:
 *
 * - email:draft, email:send, automation:rule, followup:detect → full email access
 * - email:classify, email:signal, email:trigger, email:modify → metadata only
 * - calendar:read, calendar:list → calendar read access
 * - calendar:write → calendar read + write access
 *
 * This field is kept for backwards compatibility but will be ignored.
 */
export const pluginPermissionsSchema = z.object({
  /**
   * @deprecated Email access is now derived from capabilities.
   */
  email: emailPermissionTierSchema.optional(),

  /**
   * @deprecated Calendar access is now derived from capabilities.
   */
  calendar: z.array(calendarPermissionSchema).optional(),

  /** Specific actions the plugin can perform */
  actions: z.array(z.string()).optional(),
});

export type PluginPermissions = z.infer<typeof pluginPermissionsSchema>;

/**
 * LLM configuration for the plugin
 */
export const pluginLlmConfigSchema = z.object({
  /** Model tier selection - determines which model class is used */
  tier: llmTierSchema.default("default"),
});

export type PluginLlmConfig = z.infer<typeof pluginLlmConfigSchema>;

/**
 * Plugin configuration schema
 */
export const pluginConfigSchema = z.object({
  /** Whether user configuration is required before the plugin can run */
  requiresUserConfig: z.boolean().default(false),

  /** Path to JSON schema file for config validation */
  schema: z.string().optional(),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

/**
 * Plugin icon configuration
 * SVG is preferred for scalability; PNG must be at least 512px for retina displays
 */
export const pluginIconSchema = z.object({
  /** Path to SVG icon (preferred - scales to any size) */
  svg: z.string().optional(),

  /** Path to PNG icon (fallback - minimum 512px, square aspect ratio) */
  png: z.string().optional(),
});

export type PluginIcon = z.infer<typeof pluginIconSchema>;

/**
 * Library metadata for plugin discovery and display
 */
export const pluginLibraryMetadataSchema = z.object({
  /** Category for library browsing (e.g., 'automation', 'productivity') */
  category: z.string(),

  /** Search keywords for discovery */
  keywords: z.array(z.string()).default([]),

  /**
   * Plugin icon for library listing
   * Prefer SVG for scalability; PNG must be at least 512px square
   * If not provided, a default icon is generated from the plugin name
   */
  icon: z.union([z.string(), pluginIconSchema]).optional(),

  /** Screenshot URLs for library listing */
  screenshots: z.array(z.string().url()).default([]),
});

export type PluginLibraryMetadata = z.infer<typeof pluginLibraryMetadataSchema>;

/**
 * JSON Schema property definition for settings UI
 */
export const settingsPropertySchema = z.object({
  type: z.enum(["string", "boolean", "number", "array"]),
  title: z.string().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(),
  pattern: z.string().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  enum: z.array(z.unknown()).optional(),
  items: z.unknown().optional(),
});

export type SettingsProperty = z.infer<typeof settingsPropertySchema>;

/**
 * Settings UI section for grouping related settings
 */
export const settingsUiSectionSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(z.string()),
});

export type SettingsUiSection = z.infer<typeof settingsUiSectionSchema>;

/**
 * Settings UI configuration for how to render the settings form
 */
export const settingsUiSchema = z.object({
  /** Group settings into logical sections */
  sections: z.array(settingsUiSectionSchema).optional(),
});

export type SettingsUi = z.infer<typeof settingsUiSchema>;

/**
 * Plugin settings configuration with JSON Schema for validation
 * and UI hints for rendering the settings form
 */
export const pluginSettingsSchema = z.object({
  /** JSON Schema for settings validation */
  schema: z.object({
    type: z.literal("object"),
    properties: z.record(settingsPropertySchema),
    required: z.array(z.string()).optional(),
  }),
  /** UI configuration for rendering settings form */
  ui: settingsUiSchema.optional(),
});

export type PluginSettings = z.infer<typeof pluginSettingsSchema>;

/**
 * Inbox Zero version requirements
 */
export const inboxZeroRequirementsSchema = z.object({
  /** Minimum Inbox Zero version required to run this plugin */
  min_version: z.string().regex(semverPattern, {
    message: "min_version must be a valid semver version",
  }),
});

export type InboxZeroRequirements = z.infer<typeof inboxZeroRequirementsSchema>;

/**
 * Complete plugin.json manifest schema
 *
 * This is a minimal manifest that defines how the plugin connects to Inbox Zero.
 * User settings are defined in a separate settings.json file.
 * Library metadata comes from the catalog or GitHub repo.
 *
 * Required fields: id, name, version, description, author, capabilities
 * All other fields are optional with sensible defaults.
 *
 * @example Minimal manifest
 * ```json
 * {
 *   "id": "my-plugin",
 *   "name": "My Plugin",
 *   "version": "1.0.0",
 *   "description": "A helpful plugin",
 *   "author": "Your Name",
 *   "capabilities": ["email:classify"]
 * }
 * ```
 *
 * @example Full manifest
 * ```json
 * {
 *   "id": "daily-inspiration",
 *   "name": "Daily Inspiration",
 *   "version": "1.0.0",
 *   "description": "AI-powered motivational quotes",
 *   "author": "Your Name",
 *   "homepage": "https://example.com/plugin",
 *   "repository": "https://github.com/user/plugin",
 *   "issues": "https://github.com/user/plugin/issues",
 *   "license": "MIT",
 *   "license_url": "https://opensource.org/licenses/MIT",
 *   "inbox_zero": { "min_version": "0.14.0" },
 *   "capabilities": ["email:send", "email:trigger", "schedule:cron"]
 * }
 * ```
 */
export const pluginManifestSchema = z.object({
  /** Unique plugin identifier (kebab-case recommended) */
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, {
      message: "Plugin ID must be lowercase alphanumeric with hyphens only",
    }),

  /** Human-readable plugin name */
  name: z.string().min(1),

  /** Plugin version (semver) */
  version: z.string().regex(semverPattern, {
    message:
      "Version must be a valid semver version (e.g., 1.0.0, 0.1.0-alpha.1)",
  }),

  /** Brief description of what the plugin does */
  description: z.string().min(1),

  /** Plugin author name or organization */
  author: z.string().min(1),

  /** Plugin homepage URL */
  homepage: z.string().url().optional(),

  /** GitHub/GitLab repository URL */
  repository: z.string().url().optional(),

  /** Issue tracker URL for bug reports */
  issues: z.string().url().optional(),

  /** SPDX license identifier (e.g., MIT, Apache-2.0) */
  license: z.string().optional(),

  /** URL to full license text */
  license_url: z.string().url().optional(),

  /** Inbox Zero version requirements. If not specified, plugin works with any version. */
  inbox_zero: inboxZeroRequirementsSchema.optional(),

  /** Entry point file (relative to plugin directory). Defaults to "index.ts" if not specified. */
  entry: z.string().min(1).default("index.ts"),

  /**
   * Plugin capabilities - determines which hooks are available.
   * Data access is automatically derived from capabilities.
   */
  capabilities: z.array(pluginCapabilitySchema).min(1, {
    message: "Plugin must declare at least one capability",
  }),

  /**
   * @deprecated Permissions are now automatically derived from capabilities.
   * This field is kept for backwards compatibility but will be ignored.
   */
  permissions: pluginPermissionsSchema.optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

/**
 * Parse and validate a plugin.json file
 * @param data - Raw JSON data from plugin.json
 * @returns Validated PluginManifest
 * @throws ZodError if validation fails
 */
export function parsePluginManifest(data: unknown): PluginManifest {
  return pluginManifestSchema.parse(data);
}

/**
 * Safely parse a plugin.json file, returning a result object
 * @param data - Raw JSON data from plugin.json
 * @returns SafeParseReturnType with success status and data/error
 */
export function safeParsePluginManifest(data: unknown) {
  return pluginManifestSchema.safeParse(data);
}
