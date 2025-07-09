/**
 * Google Workspace SSO utilities for Inbox Zero AI
 * Provides domain restriction and workspace organization features
 */

import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("workspace-sso");

export interface WorkspaceUser {
  email: string;
  domain: string;
  isWorkspaceUser: boolean;
  organizationId?: string;
  organizationName?: string;
}

/**
 * Validates if a user's email domain is allowed for workspace SSO
 */
export function isAllowedWorkspaceDomain(email: string): boolean {
  if (!env.GOOGLE_WORKSPACE_DOMAIN) {
    return true; // No domain restriction configured
  }

  const allowedDomains = env.GOOGLE_WORKSPACE_DOMAIN.split(",").map((d) =>
    d.trim(),
  );
  const userDomain = email.split("@")[1]?.toLowerCase();

  if (!userDomain) {
    return false;
  }

  return allowedDomains.some(
    (domain) =>
      domain.toLowerCase() === userDomain ||
      userDomain.endsWith(`.${domain.toLowerCase()}`),
  );
}

/**
 * Extracts workspace information from user's email and profile
 */
export function extractWorkspaceInfo(
  email: string,
  profile?: any,
): WorkspaceUser {
  const domain = email.split("@")[1]?.toLowerCase() || "";

  // Check if this is a workspace user (not gmail.com, googlemail.com, etc.)
  const isPersonalGmail = ["gmail.com", "googlemail.com"].includes(domain);

  const isWorkspaceUser = !isPersonalGmail && domain.length > 0;

  return {
    email,
    domain,
    isWorkspaceUser,
    organizationId: profile?.hd, // Google Workspace hosted domain
    organizationName: profile?.org_name,
  };
}

/**
 * Validates Google Workspace authentication
 */
export async function validateWorkspaceAuth(
  email: string,
  profile?: any,
): Promise<{ isValid: boolean; reason?: string }> {
  try {
    const workspaceInfo = extractWorkspaceInfo(email, profile);

    // Check domain restrictions
    if (!isAllowedWorkspaceDomain(email)) {
      logger.warn("User from disallowed domain attempted login", {
        email,
        domain: workspaceInfo.domain,
        allowedDomains: env.GOOGLE_WORKSPACE_DOMAIN,
      });
      return {
        isValid: false,
        reason: "Domain not allowed for this organization",
      };
    }

    // If customer ID is configured, validate against it
    if (env.GOOGLE_WORKSPACE_CUSTOMER_ID && workspaceInfo.isWorkspaceUser) {
      // This would require additional Google Admin SDK integration
      // For now, we'll just log and allow
      logger.info("Workspace user authenticated", {
        email,
        organizationId: workspaceInfo.organizationId,
        customerId: env.GOOGLE_WORKSPACE_CUSTOMER_ID,
      });
    }

    return { isValid: true };
  } catch (error) {
    logger.error("Error validating workspace auth", {
      email,
      error,
    });
    return {
      isValid: false,
      reason: "Authentication validation failed",
    };
  }
}

/**
 * Creates workspace-specific user metadata
 */
export function createWorkspaceUserMetadata(workspaceInfo: WorkspaceUser) {
  return {
    isWorkspaceUser: workspaceInfo.isWorkspaceUser,
    domain: workspaceInfo.domain,
    organizationId: workspaceInfo.organizationId,
    organizationName: workspaceInfo.organizationName,
  };
}
