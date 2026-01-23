/**
 * Permission enforcement at runtime for the plugin system.
 *
 * This module provides functions to enforce field-level access to email and calendar
 * data based on the permissions declared in a plugin's manifest.
 */

import type { CalendarPermission } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";

// Re-export for convenience
export type { CalendarPermission };

/**
 * Email fields that can be accessed by plugins.
 */
export type EmailField =
  | "id"
  | "threadId"
  | "subject"
  | "from"
  | "to"
  | "cc"
  | "bcc"
  | "replyTo"
  | "snippet"
  | "body"
  | "headers"
  | "date"
  | "labelIds"
  | "attachments";

/**
 * Email data structure that plugins receive.
 */
export interface Email {
  id: string;
  threadId?: string;
  subject?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  snippet?: string;
  body?: string;
  headers?: Record<string, string>;
  date?: Date | string;
  labelIds?: string[];
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

/**
 * Fields that are always accessible regardless of permissions.
 * These are necessary for basic plugin functionality.
 */
const ALWAYS_ALLOWED_FIELDS: EmailField[] = ["id"];

/**
 * Default email permissions for plugins that don't declare any.
 * Provides minimal access for classification.
 */
const DEFAULT_EMAIL_PERMISSIONS: EmailField[] = ["subject", "from", "snippet"];

/**
 * Enforce email field permissions by filtering out fields the plugin cannot access.
 * Returns a partial Email object containing only the permitted fields.
 */
export function enforceEmailPermissions(
  email: Email,
  permissions: string[],
): Partial<Email> {
  const emailPermissions =
    permissions.length > 0
      ? (permissions as EmailField[])
      : DEFAULT_EMAIL_PERMISSIONS;

  // combine always-allowed fields with declared permissions
  const allowedFields = new Set<EmailField>([
    ...ALWAYS_ALLOWED_FIELDS,
    ...emailPermissions,
  ]);

  const result: Partial<Email> = {};

  // id is always included
  result.id = email.id;

  // conditionally include other fields based on permissions
  if (allowedFields.has("threadId") && email.threadId !== undefined) {
    result.threadId = email.threadId;
  }

  if (allowedFields.has("subject") && email.subject !== undefined) {
    result.subject = email.subject;
  }

  if (allowedFields.has("from") && email.from !== undefined) {
    result.from = email.from;
  }

  if (allowedFields.has("to") && email.to !== undefined) {
    result.to = email.to;
  }

  if (allowedFields.has("cc") && email.cc !== undefined) {
    result.cc = email.cc;
  }

  if (allowedFields.has("bcc") && email.bcc !== undefined) {
    result.bcc = email.bcc;
  }

  if (allowedFields.has("replyTo") && email.replyTo !== undefined) {
    result.replyTo = email.replyTo;
  }

  if (allowedFields.has("snippet") && email.snippet !== undefined) {
    result.snippet = email.snippet;
  }

  if (allowedFields.has("body") && email.body !== undefined) {
    result.body = email.body;
  }

  if (allowedFields.has("headers") && email.headers !== undefined) {
    result.headers = email.headers;
  }

  if (allowedFields.has("date") && email.date !== undefined) {
    result.date = email.date;
  }

  if (allowedFields.has("labelIds") && email.labelIds !== undefined) {
    result.labelIds = email.labelIds;
  }

  if (allowedFields.has("attachments") && email.attachments !== undefined) {
    result.attachments = email.attachments;
  }

  return result;
}

/**
 * Enforce calendar permissions and return access flags.
 * Note: "list" capability is handled via calendar:list, not as a permission.
 */
export function enforceCalendarPermissions(permissions: string[]): {
  canRead: boolean;
  canWrite: boolean;
} {
  const calendarPermissions = new Set(permissions);

  return {
    canRead: calendarPermissions.has("read"),
    canWrite: calendarPermissions.has("write"),
  };
}

/**
 * Check if a specific email field is permitted.
 */
export function isEmailFieldPermitted(
  field: EmailField,
  permissions: string[],
): boolean {
  if (ALWAYS_ALLOWED_FIELDS.includes(field)) {
    return true;
  }

  const emailPermissions =
    permissions.length > 0 ? permissions : DEFAULT_EMAIL_PERMISSIONS;

  return emailPermissions.includes(field);
}

/**
 * Check if a specific calendar permission is granted.
 */
export function hasCalendarPermission(
  permission: CalendarPermission,
  permissions: string[],
): boolean {
  return permissions.includes(permission);
}

/**
 * Get a list of email fields that are blocked for given permissions.
 * Useful for displaying what a plugin cannot access.
 */
export function getBlockedEmailFields(permissions: string[]): EmailField[] {
  const allFields: EmailField[] = [
    "id",
    "threadId",
    "subject",
    "from",
    "to",
    "cc",
    "bcc",
    "replyTo",
    "snippet",
    "body",
    "headers",
    "date",
    "labelIds",
    "attachments",
  ];

  return allFields.filter(
    (field) => !isEmailFieldPermitted(field, permissions),
  );
}

/**
 * Validate that requested email permissions are valid field names.
 */
export function validateEmailPermissions(permissions: string[]): {
  valid: boolean;
  invalidFields: string[];
} {
  const validFields: EmailField[] = [
    "id",
    "threadId",
    "subject",
    "from",
    "to",
    "cc",
    "bcc",
    "replyTo",
    "snippet",
    "body",
    "headers",
    "date",
    "labelIds",
    "attachments",
  ];

  const invalidFields = permissions.filter(
    (p) => !validFields.includes(p as EmailField),
  );

  return {
    valid: invalidFields.length === 0,
    invalidFields,
  };
}

/**
 * Validate that requested calendar permissions are valid.
 * Note: "list" is a capability (calendar:list), not a permission.
 */
export function validateCalendarPermissions(permissions: string[]): {
  valid: boolean;
  invalidPermissions: string[];
} {
  const validPermissions: CalendarPermission[] = ["read", "write"];

  const invalidPermissions = permissions.filter(
    (p) => !validPermissions.includes(p as CalendarPermission),
  );

  return {
    valid: invalidPermissions.length === 0,
    invalidPermissions,
  };
}

/**
 * Create a permission-enforcing email accessor.
 * Returns a proxy that only allows access to permitted fields.
 */
export function createPermissionEnforcedEmail(
  email: Email,
  permissions: string[],
): Readonly<Partial<Email>> {
  const enforcedEmail = enforceEmailPermissions(email, permissions);
  return Object.freeze(enforcedEmail);
}

/**
 * Summarize what a plugin can access based on its permissions.
 * Useful for displaying permission info to users.
 */
export function summarizePermissions(
  emailPermissions: string[],
  calendarPermissions: string[],
): {
  emailFields: EmailField[];
  calendar: { canRead: boolean; canWrite: boolean };
  sensitiveAccess: string[];
} {
  const emailFields =
    emailPermissions.length > 0
      ? [...ALWAYS_ALLOWED_FIELDS, ...(emailPermissions as EmailField[])]
      : [...ALWAYS_ALLOWED_FIELDS, ...DEFAULT_EMAIL_PERMISSIONS];

  const calendar = enforceCalendarPermissions(calendarPermissions);

  // identify sensitive access
  const sensitiveAccess: string[] = [];
  if (emailPermissions.includes("body")) {
    sensitiveAccess.push("Full email body content");
  }
  if (emailPermissions.includes("attachments")) {
    sensitiveAccess.push("Email attachments");
  }
  if (emailPermissions.includes("bcc")) {
    sensitiveAccess.push("BCC recipients");
  }
  if (calendar.canWrite) {
    sensitiveAccess.push("Create/modify calendar events");
  }

  return {
    emailFields: [...new Set(emailFields)],
    calendar,
    sensitiveAccess,
  };
}
