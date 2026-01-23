/**
 * Options for sending a new email.
 */
export interface SendEmailOptions {
  /**
   * List of recipient email addresses (To field).
   */
  to: string[];
  /**
   * Optional list of CC recipient email addresses.
   */
  cc?: string[];
  /**
   * Optional list of BCC recipient email addresses.
   */
  bcc?: string[];
  /**
   * Email subject line.
   */
  subject: string;
  /**
   * Email body content.
   */
  body: string;
  /**
   * Body content type.
   * @default 'text'
   */
  bodyType?: "text" | "html";
  /**
   * Optional sender address override.
   *
   * **Requires `email:send_as` capability.**
   *
   * Must be a plus-tag variant of the user's registered email address.
   * For example, if user's email is `jordan@company.com`, valid values are:
   * - `jordan+assistant@company.com`
   * - `jordan+calendar@company.com`
   *
   * @example
   * ```typescript
   * await ctx.email.send({
   *   to: ['recipient@example.com'],
   *   subject: 'Meeting Request',
   *   body: 'Hello...',
   *   from: 'jordan+finley@company.com',
   * });
   * ```
   */
  from?: string;
  /**
   * Optional reply-to address.
   *
   * When set, replies to this email will be directed to this address
   * instead of the from address.
   */
  replyTo?: string;
}

/**
 * Options for replying to an existing email thread.
 */
export interface ReplyEmailOptions {
  /**
   * The thread ID to reply to.
   */
  threadId: string;
  /**
   * Reply body content.
   */
  body: string;
  /**
   * Body content type.
   * @default 'text'
   */
  bodyType?: "text" | "html";
  /**
   * Optional sender address override.
   *
   * **Requires `email:send_as` capability.**
   *
   * Must be a plus-tag variant of the user's registered email address.
   * For example, if user's email is `jordan@company.com`, valid values are:
   * - `jordan+assistant@company.com`
   * - `jordan+calendar@company.com`
   */
  from?: string;
}

/**
 * Result of sending an email.
 */
export interface SendEmailResult {
  /**
   * The ID of the sent message.
   */
  messageId: string;
}

/**
 * Plugin Email interface for sending emails.
 *
 * This interface allows plugins to send emails proactively, not just draft replies.
 *
 * **Trust Level Requirement**: The `email:send` capability requires `verified` trust level.
 *
 * @example
 * ```typescript
 * // Send a new email
 * const result = await ctx.email.send({
 *   to: ['recipient@example.com'],
 *   cc: ['manager@example.com'],
 *   subject: 'Weekly Report Summary',
 *   body: '<h1>Weekly Report</h1><p>Here is your summary...</p>',
 *   bodyType: 'html',
 * });
 * console.log(`Sent email: ${result.messageId}`);
 *
 * // Reply to an existing thread
 * const reply = await ctx.email.reply({
 *   threadId: 'thread-123',
 *   body: 'Thank you for your message. I will follow up shortly.',
 *   bodyType: 'text',
 * });
 * ```
 */
export interface PluginEmail {
  /**
   * Send a new email.
   *
   * @param options - Email sending options including recipients, subject, and body
   * @returns Object containing the sent message ID
   */
  send(options: SendEmailOptions): Promise<SendEmailResult>;

  /**
   * Reply to an existing email thread.
   *
   * @param options - Reply options including thread ID and body
   * @returns Object containing the sent message ID
   */
  reply(options: ReplyEmailOptions): Promise<SendEmailResult>;
}
