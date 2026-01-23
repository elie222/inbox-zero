import { env } from "@/env";
import prisma from "@/utils/prisma";

type AllowlistMode = "open" | "curated" | "admin-only";

interface AllowlistResult {
  /** List of allowed plugin IDs, or null if all plugins are allowed (open mode) */
  allowed: string[] | null;
  /** The resolution mode:
   * - 'open': All plugins allowed (no restrictions)
   * - 'curated': Only specific plugins from allowlist
   * - 'admin-only': Users can only enable pre-installed plugins
   */
  mode: AllowlistMode;
}

interface OrganizationMetadata {
  allowedPlugins?: string[];
}

/**
 * Resolves the effective plugin allowlist by combining instance-level
 * and organization-level restrictions.
 *
 * Resolution hierarchy:
 * 1. If PLUGINS_USER_INSTALL_ENABLED is false, return admin-only mode
 * 2. Instance allowlist (PLUGINS_ALLOWED_LIST) sets the ceiling
 * 3. Org allowlist can only restrict further, not expand permissions
 * 4. Intersection of both lists is the effective allowlist
 */
export async function getEffectiveAllowlist(
  organizationId?: string,
): Promise<AllowlistResult> {
  const instanceList =
    env.PLUGINS_ALLOWED_LIST?.split(",").filter(Boolean) ?? [];
  const userInstallEnabled = env.PLUGINS_USER_INSTALL_ENABLED !== false;

  // admin-only mode: users can only enable pre-installed plugins
  if (!userInstallEnabled) {
    return { allowed: [], mode: "admin-only" };
  }

  // get organization allowlist if applicable
  let orgList: string[] = [];
  if (organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { metadata: true },
    });

    const metadata = org?.metadata as OrganizationMetadata | null;
    orgList = metadata?.allowedPlugins ?? [];
  }

  // resolution logic
  if (instanceList.length === 0) {
    // no instance restriction
    if (orgList.length > 0) {
      return { allowed: orgList, mode: "curated" };
    }
    return { allowed: null, mode: "open" };
  }

  if (orgList.length === 0) {
    // org hasn't customized - use instance list
    return { allowed: instanceList, mode: "curated" };
  }

  // intersection: org can only restrict, not expand beyond instance ceiling
  const intersection = orgList.filter((p) => instanceList.includes(p));
  return { allowed: intersection, mode: "curated" };
}

/**
 * Checks if a specific plugin is allowed based on the resolved allowlist.
 */
export function isPluginAllowed(
  pluginId: string,
  allowlist: AllowlistResult,
): boolean {
  if (allowlist.allowed === null) return true; // open mode
  return allowlist.allowed.includes(pluginId);
}

/**
 * Filters a list of plugin IDs to only include allowed ones.
 */
export function filterAllowedPlugins(
  pluginIds: string[],
  allowlist: AllowlistResult,
): string[] {
  if (allowlist.allowed === null) return pluginIds; // open mode
  return pluginIds.filter((id) => allowlist.allowed!.includes(id));
}
