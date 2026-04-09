import nodemailer from "nodemailer";
import type { ImapCredentialConfig } from "@/utils/imap/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("imap/mail");

function createSmtpTransport(config: ImapCredentialConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecurity === "tls",
    auth: {
      user: config.username,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: config.smtpSecurity !== "none",
    },
  });
}

export async function sendSmtpEmail(
  config: ImapCredentialConfig,
  options: {
    to: string;
    from?: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text?: string;
    html?: string;
    replyTo?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: Array<{
      filename: string;
      content: string | Buffer;
      contentType?: string;
    }>;
  },
): Promise<{ messageId: string }> {
  const transport = createSmtpTransport(config);

  try {
    const result = await transport.sendMail({
      from: options.from || config.email,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text: options.text,
      html: options.html,
      replyTo: options.replyTo,
      inReplyTo: options.inReplyTo,
      references: options.references,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    logger.info("Email sent via SMTP", {
      to: options.to,
      messageId: result.messageId,
    });

    return { messageId: result.messageId };
  } finally {
    transport.close();
  }
}

/**
 * Test SMTP connection by verifying the transport.
 */
export async function testSmtpConnection(
  config: ImapCredentialConfig,
): Promise<boolean> {
  const transport = createSmtpTransport(config);

  try {
    await transport.verify();
    return true;
  } finally {
    transport.close();
  }
}
