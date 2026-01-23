/**
 * Plugin Email Context
 *
 * Creates a PluginEmail instance that allows plugins to send emails.
 * Only available to plugins with the email:send capability.
 */

import type {
  PluginEmail,
  SendEmailOptions,
  ReplyEmailOptions,
  SendEmailResult,
} from "@/packages/plugin-sdk/src/types/email";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("plugin-runtime/email");

// maximum recipients to prevent abuse
const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 998; // RFC 5322 limit
const MAX_BODY_LENGTH = 10 * 1024 * 1024; // 10MB limit

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface PluginEmailConfig {
  emailAccountId: string;
  provider: "google" | "microsoft";
  pluginId: string;
  userEmail: string;
  /** Whether the plugin has email:send_as capability */
  hasSendAsCapability?: boolean;
}

// -----------------------------------------------------------------------------
// Validation Helpers
// -----------------------------------------------------------------------------

function validateEmailAddress(email: string): boolean {
  // basic RFC 5322 validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateEmailAddresses(emails: string[]): {
  valid: boolean;
  invalid: string[];
} {
  const invalid = emails.filter((email) => !validateEmailAddress(email));
  return { valid: invalid.length === 0, invalid };
}

/**
 * Checks if a domain is a Gmail domain (gmail.com or googlemail.com).
 * Gmail ignores dots in the local part, so we need to normalize for comparison.
 */
function isGmailDomain(domain: string): boolean {
  const lowerDomain = domain.toLowerCase();
  return lowerDomain === "gmail.com" || lowerDomain === "googlemail.com";
}

/**
 * Normalizes a Gmail local part by removing dots.
 * Gmail treats "john.doe" and "johndoe" as the same address.
 */
function normalizeGmailLocal(local: string): string {
  return local.replace(/\./g, "");
}

/**
 * Validates that a from address is a valid plus-tag variant of the user's email.
 *
 * A plus-tag address adds a tag after a plus sign in the local part:
 * - user@domain.com -> user+tag@domain.com
 *
 * Security constraints:
 * - Plugins can only send from plus-tag variants, not from the user's primary email
 * - The plus-tag token must be lowercase
 * - For Gmail: dots in local part are normalized (john.doe = johndoe)
 * - Domain comparison is case-insensitive
 * - Local part base must match (case-sensitive, except Gmail dot normalization)
 *
 * @param fromAddress - The requested from address
 * @param userEmail - The user's primary email address
 * @returns An object with valid flag and error message if invalid
 */
function validatePlusTagFromAddress(
  fromAddress: string,
  userEmail: string,
): { valid: boolean; error?: string } {
  if (!validateEmailAddress(fromAddress)) {
    return { valid: false, error: `Invalid from address: ${fromAddress}` };
  }

  const [fromLocalRaw, fromDomainRaw] = fromAddress.split("@");
  const [userLocalRaw, userDomainRaw] = userEmail.split("@");

  // domain comparison is case-insensitive
  const fromDomain = fromDomainRaw.toLowerCase();
  const userDomain = userDomainRaw.toLowerCase();

  if (fromDomain !== userDomain) {
    return {
      valid: false,
      error: `From address domain must match user's domain. Expected: ${userDomainRaw}, got: ${fromDomainRaw}`,
    };
  }

  // extract plus-tag from from address
  const plusIndex = fromLocalRaw.indexOf("+");
  if (plusIndex === -1) {
    return {
      valid: false,
      error: `From address must include a plus-tag (e.g., ${userLocalRaw}+tag@${userDomainRaw}). Got: ${fromAddress}`,
    };
  }

  const fromBaseLocal = fromLocalRaw.slice(0, plusIndex);
  const tag = fromLocalRaw.slice(plusIndex + 1);

  // for Gmail, normalize dots in local part for comparison
  // Gmail treats "john.doe" and "johndoe" as the same address
  const isGmail = isGmailDomain(fromDomain);
  const normalizedFromBase = isGmail
    ? normalizeGmailLocal(fromBaseLocal)
    : fromBaseLocal;
  const normalizedUserLocal = isGmail
    ? normalizeGmailLocal(userLocalRaw)
    : userLocalRaw;

  // local part base must match (case-sensitive comparison)
  if (normalizedFromBase !== normalizedUserLocal) {
    return {
      valid: false,
      error: `From address local part must match user's. Expected: ${userLocalRaw}+tag@${userDomainRaw}, got: ${fromAddress}`,
    };
  }

  if (!tag || tag.trim() === "") {
    return {
      valid: false,
      error: `Plus-tag cannot be empty. Use format: ${userLocalRaw}+tag@${userDomainRaw}`,
    };
  }

  // validate tag contains only safe characters (alphanumeric, hyphen, underscore)
  const safeTagPattern = /^[a-zA-Z0-9_-]+$/;
  if (!safeTagPattern.test(tag)) {
    return {
      valid: false,
      error: `Plus-tag can only contain letters, numbers, hyphens, and underscores. Got: ${tag}`,
    };
  }

  // tag must be lowercase
  if (tag !== tag.toLowerCase()) {
    return {
      valid: false,
      error: `Plus-tag must be lowercase. Got: ${tag}, expected: ${tag.toLowerCase()}`,
    };
  }

  return { valid: true };
}

/**
 * Extracts the plus-tag from an email address.
 *
 * @param email - The email address to extract from (e.g., "user+tag@domain.com")
 * @returns The tag in lowercase, or null if no plus-tag present
 *
 * @example
 * extractPlusTag("user+finley@domain.com") // returns "finley"
 * extractPlusTag("user+FINLEY@domain.com") // returns "finley" (normalized)
 * extractPlusTag("user@domain.com") // returns null
 */
export function extractPlusTag(email: string): string | null {
  if (!email) return null;

  const atIndex = email.indexOf("@");
  if (atIndex === -1) return null;

  const localPart = email.slice(0, atIndex);
  const plusIndex = localPart.indexOf("+");

  if (plusIndex === -1) return null;

  const tag = localPart.slice(plusIndex + 1);
  if (!tag) return null;

  // normalize to lowercase for case-insensitive matching
  return tag.toLowerCase();
}

/**
 * Checks if an email's plus-tag matches a registered trigger tag.
 *
 * Matching is case-insensitive: a reply to user+FINLEY@domain.com
 * will match a trigger registered for "finley".
 *
 * @param email - The incoming email address
 * @param registeredTag - The tag registered by a plugin (should be lowercase)
 * @returns True if the email's plus-tag matches the registered tag
 */
export function matchesPlusTag(email: string, registeredTag: string): boolean {
  const emailTag = extractPlusTag(email);
  if (!emailTag) return false;

  // both normalized to lowercase for case-insensitive comparison
  return emailTag === registeredTag.toLowerCase();
}

function validateSendOptions(options: SendEmailOptions): void {
  if (!options.to?.length) {
    throw new Error("At least one recipient (to) is required");
  }

  if (options.to.length > MAX_RECIPIENTS) {
    throw new Error(`Too many recipients. Maximum is ${MAX_RECIPIENTS}`);
  }

  const allRecipients = [
    ...options.to,
    ...(options.cc ?? []),
    ...(options.bcc ?? []),
  ];

  if (allRecipients.length > MAX_RECIPIENTS) {
    throw new Error(`Total recipients exceed maximum of ${MAX_RECIPIENTS}`);
  }

  const { valid, invalid } = validateEmailAddresses(allRecipients);
  if (!valid) {
    throw new Error(`Invalid email addresses: ${invalid.join(", ")}`);
  }

  if (!options.subject) {
    throw new Error("Subject is required");
  }

  if (options.subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `Subject too long. Maximum is ${MAX_SUBJECT_LENGTH} characters`,
    );
  }

  if (!options.body) {
    throw new Error("Body is required");
  }

  if (options.body.length > MAX_BODY_LENGTH) {
    throw new Error(
      `Body too large. Maximum is ${MAX_BODY_LENGTH / (1024 * 1024)}MB`,
    );
  }
}

function validateReplyOptions(options: ReplyEmailOptions): void {
  if (!options.threadId) {
    throw new Error("threadId is required for reply");
  }

  if (!options.body) {
    throw new Error("Body is required");
  }

  if (options.body.length > MAX_BODY_LENGTH) {
    throw new Error(
      `Body too large. Maximum is ${MAX_BODY_LENGTH / (1024 * 1024)}MB`,
    );
  }
}

// -----------------------------------------------------------------------------
// Email Sending Implementation
// -----------------------------------------------------------------------------

async function sendViaProvider(
  provider: EmailProvider,
  options: SendEmailOptions,
  pluginId: string,
): Promise<SendEmailResult> {
  const log = logger.with({
    pluginId,
    action: "send",
    recipientCount: options.to.length,
  });

  log.info("Plugin sending email", {
    to: options.to,
    subject: options.subject.slice(0, 50),
    bodyType: options.bodyType ?? "text",
    from: options.from,
    replyTo: options.replyTo,
  });

  const bodyType = options.bodyType ?? "text";
  const to = options.to.join(", ");
  const cc = options.cc?.join(", ");
  const bcc = options.bcc?.join(", ");

  if (bodyType === "html") {
    const result = await provider.sendEmailWithHtml({
      to,
      cc,
      bcc,
      subject: options.subject,
      messageHtml: options.body,
      from: options.from,
      replyTo: options.replyTo,
    });

    log.info("Email sent successfully", { messageId: result.messageId });
    return { messageId: result.messageId };
  }

  // plain text email - convert to HTML for consistent send-as support
  // the sendEmail interface doesn't support from field, so use sendEmailWithHtml
  if (options.from || options.replyTo) {
    const htmlBody = `<html><body>${options.body
      .split("\n")
      .map((p) => `<p>${p}</p>`)
      .join("")}</body></html>`;
    const result = await provider.sendEmailWithHtml({
      to,
      cc,
      bcc,
      subject: options.subject,
      messageHtml: htmlBody,
      from: options.from,
      replyTo: options.replyTo,
    });
    log.info("Plain text email sent via HTML path", {
      messageId: result.messageId,
    });
    return { messageId: result.messageId };
  }

  // original plain text path (no custom from/replyTo)
  await provider.sendEmail({
    to,
    cc,
    bcc,
    subject: options.subject,
    messageText: options.body,
  });

  // sendEmail doesn't return messageId, generate a placeholder
  const messageId = `plugin-${pluginId}-${Date.now()}`;
  log.info("Plain text email sent successfully", { messageId });

  return { messageId };
}

async function replyViaProvider(
  provider: EmailProvider,
  options: ReplyEmailOptions,
  pluginId: string,
): Promise<SendEmailResult> {
  const log = logger.with({
    pluginId,
    action: "reply",
    threadId: options.threadId,
  });

  log.info("Plugin replying to thread", {
    threadId: options.threadId,
    bodyType: options.bodyType ?? "text",
    from: options.from,
  });

  // get the thread to find the message to reply to
  const thread = await provider.getThread(options.threadId);

  if (!thread.messages.length) {
    throw new Error(`Thread ${options.threadId} not found or has no messages`);
  }

  // get the latest message in the thread
  const lastMessage = thread.messages[thread.messages.length - 1];

  const bodyType = options.bodyType ?? "text";

  if (bodyType === "html" || options.from) {
    // use sendEmailWithHtml with reply context (also needed for custom from address)
    const htmlBody =
      bodyType === "html"
        ? options.body
        : `<html><body>${options.body
            .split("\n")
            .map((p) => `<p>${p}</p>`)
            .join("")}</body></html>`;

    const result = await provider.sendEmailWithHtml({
      replyToEmail: {
        threadId: options.threadId,
        headerMessageId: lastMessage.headers["message-id"] ?? "",
        references: lastMessage.headers.references,
      },
      to: lastMessage.headers["reply-to"] ?? lastMessage.headers.from,
      subject: lastMessage.subject.startsWith("Re:")
        ? lastMessage.subject
        : `Re: ${lastMessage.subject}`,
      messageHtml: htmlBody,
      from: options.from,
    });

    log.info("Reply sent successfully", { messageId: result.messageId });
    return { messageId: result.messageId };
  }

  // plain text reply (no custom from address)
  await provider.replyToEmail(lastMessage, options.body);

  // replyToEmail doesn't return messageId, generate placeholder
  const messageId = `plugin-${pluginId}-reply-${Date.now()}`;
  log.info("Plain text reply sent successfully", { messageId });

  return { messageId };
}

// -----------------------------------------------------------------------------
// Main Factory Function
// -----------------------------------------------------------------------------

/**
 * Error thrown when a plugin tries to use send_as without the capability.
 */
export class PluginSendAsCapabilityError extends Error {
  readonly code = "send-as-capability-not-declared";

  constructor() {
    super(
      'Plugin attempted to use custom "from" address but did not declare "email:send_as" capability. ' +
        'Add "email:send_as" to your capabilities array in plugin.json to use this feature.',
    );
    this.name = "PluginSendAsCapabilityError";
  }
}

/**
 * Error thrown when a from address validation fails.
 */
export class PluginFromAddressError extends Error {
  readonly code = "invalid-from-address";

  constructor(message: string) {
    super(message);
    this.name = "PluginFromAddressError";
  }
}

/**
 * Creates a PluginEmail instance that allows plugins to send emails.
 * Only available to plugins with the email:send capability.
 *
 * @param config - Configuration for the email context
 * @returns A PluginEmail instance with send and reply methods
 *
 * @example
 * ```typescript
 * const email = createPluginEmail({
 *   emailAccountId: 'account-123',
 *   provider: 'google',
 *   pluginId: 'my-plugin',
 *   userEmail: 'user@example.com',
 *   hasSendAsCapability: true,
 * });
 *
 * await email.send({
 *   to: ['recipient@example.com'],
 *   subject: 'Hello',
 *   body: 'Message body',
 *   from: 'user+assistant@example.com', // requires email:send_as capability
 * });
 * ```
 */
export function createPluginEmail(config: PluginEmailConfig): PluginEmail {
  const { emailAccountId, provider, pluginId, userEmail, hasSendAsCapability } =
    config;

  // lazily create the email provider when first needed
  let emailProvider: EmailProvider | null = null;

  async function getProvider(): Promise<EmailProvider> {
    if (!emailProvider) {
      const providerLogger = logger.with({ pluginId, emailAccountId });
      emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger: providerLogger,
      });
    }
    return emailProvider;
  }

  /**
   * Validates the from address if provided.
   * - Requires email:send_as capability
   * - Must be a valid plus-tag variant of the user's email
   */
  function validateFromAddress(from: string | undefined): void {
    if (!from) return;

    // check capability
    if (!hasSendAsCapability) {
      throw new PluginSendAsCapabilityError();
    }

    // validate plus-tag format
    const validation = validatePlusTagFromAddress(from, userEmail);
    if (!validation.valid) {
      throw new PluginFromAddressError(validation.error!);
    }
  }

  return {
    async send(options: SendEmailOptions): Promise<SendEmailResult> {
      const log = logger.with({ pluginId, action: "send" });

      try {
        validateSendOptions(options);
        validateFromAddress(options.from);

        const emailProviderInstance = await getProvider();
        return await sendViaProvider(emailProviderInstance, options, pluginId);
      } catch (error) {
        log.error("Plugin email send failed", {
          error,
          to: options.to,
          subject: options.subject?.slice(0, 50),
        });
        throw error;
      }
    },

    async reply(options: ReplyEmailOptions): Promise<SendEmailResult> {
      const log = logger.with({ pluginId, action: "reply" });

      try {
        validateReplyOptions(options);
        validateFromAddress(options.from);

        const emailProviderInstance = await getProvider();
        return await replyViaProvider(emailProviderInstance, options, pluginId);
      } catch (error) {
        log.error("Plugin email reply failed", {
          error,
          threadId: options.threadId,
        });
        throw error;
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export type {
  PluginEmail,
  SendEmailOptions,
  ReplyEmailOptions,
  SendEmailResult,
};
