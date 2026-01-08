import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { getFilebotEmail } from "@/utils/filebot/is-filebot-email";

// ============================================================================
// Types
// ============================================================================

interface SourceMessageInfo {
  threadId: string;
  headerMessageId: string;
  references?: string;
}

interface FilingNotificationParams {
  emailProvider: EmailProvider;
  userEmail: string;
  filingId: string;
  sourceMessage: SourceMessageInfo;
  logger: Logger;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Send a notification email for a successful filing.
 * "✓ Filed Receipt.pdf to Receipts/2024/December"
 * Sent as a reply to the source email thread.
 */
export async function sendFiledNotification({
  emailProvider,
  userEmail,
  filingId,
  sourceMessage,
  logger,
}: FilingNotificationParams): Promise<void> {
  const log = logger.with({ action: "sendFiledNotification", filingId });

  const filing = await prisma.documentFiling.findUnique({
    where: { id: filingId },
    include: {
      driveConnection: { select: { provider: true } },
    },
  });

  if (!filing) {
    log.error("Filing not found");
    return;
  }

  const replyToAddress = getFilebotEmail({ userEmail });

  const subject = `✓ Filed ${filing.filename}`;
  const messageHtml = buildFiledEmailHtml({
    filename: filing.filename,
    folderPath: filing.folderPath,
    driveProvider: filing.driveConnection.provider,
  });

  try {
    const result = await emailProvider.sendEmailWithHtml({
      replyToEmail: sourceMessage,
      to: userEmail,
      replyTo: replyToAddress,
      subject,
      messageHtml,
    });

    await prisma.documentFiling.update({
      where: { id: filingId },
      data: {
        notificationMessageId: result.messageId,
        notificationSentAt: new Date(),
      },
    });

    log.info("Filed notification sent", { messageId: result.messageId });
  } catch (error) {
    log.error("Failed to send filed notification", { error });
    throw error;
  }
}

/**
 * Send a notification email asking where to file a document.
 * "📄 Where should I file Contract.pdf?"
 * Sent as a reply to the source email thread.
 */
export async function sendAskNotification({
  emailProvider,
  userEmail,
  filingId,
  sourceMessage,
  logger,
}: FilingNotificationParams): Promise<void> {
  const log = logger.with({ action: "sendAskNotification", filingId });

  const filing = await prisma.documentFiling.findUnique({
    where: { id: filingId },
  });

  if (!filing) {
    log.error("Filing not found");
    return;
  }

  const replyToAddress = getFilebotEmail({ userEmail });

  const subject = `📄 Where should I file ${filing.filename}?`;
  const messageHtml = buildAskEmailHtml({
    filename: filing.filename,
    reasoning: filing.reasoning,
  });

  try {
    const result = await emailProvider.sendEmailWithHtml({
      replyToEmail: sourceMessage,
      to: userEmail,
      replyTo: replyToAddress,
      subject,
      messageHtml,
    });

    await prisma.documentFiling.update({
      where: { id: filingId },
      data: {
        notificationMessageId: result.messageId,
        notificationSentAt: new Date(),
      },
    });

    log.info("Ask notification sent", { messageId: result.messageId });
  } catch (error) {
    log.error("Failed to send ask notification", { error });
    throw error;
  }
}

/**
 * Send a confirmation email after a correction.
 * "Done! Moved to Business/Expenses"
 * Sent as a reply to the source email thread.
 */
export async function sendCorrectionConfirmation({
  emailProvider,
  userEmail,
  filingId,
  sourceMessage,
  newFolderPath,
  logger,
}: FilingNotificationParams & { newFolderPath: string }): Promise<void> {
  const log = logger.with({ action: "sendCorrectionConfirmation", filingId });

  const filing = await prisma.documentFiling.findUnique({
    where: { id: filingId },
  });

  if (!filing) {
    log.error("Filing not found");
    return;
  }

  const replyToAddress = getFilebotEmail({ userEmail });

  const subject = `Re: ✓ Filed ${filing.filename}`;
  const messageHtml = buildCorrectionConfirmationHtml({
    filename: filing.filename,
    newFolderPath,
  });

  try {
    await emailProvider.sendEmailWithHtml({
      replyToEmail: sourceMessage,
      to: userEmail,
      replyTo: replyToAddress,
      subject,
      messageHtml,
    });

    log.info("Correction confirmation sent");
  } catch (error) {
    log.error("Failed to send correction confirmation", { error });
    throw error;
  }
}

// ============================================================================
// Email Templates
// ============================================================================

function buildFiledEmailHtml({
  filename,
  folderPath,
  driveProvider,
}: {
  filename: string;
  folderPath: string;
  driveProvider: string;
}): string {
  const driveName = driveProvider === "google" ? "Google Drive" : "OneDrive";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px;">
      <p>Filed your document:</p>
      
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0 0 8px 0;">
          <strong>📄 ${escapeHtml(filename)}</strong>
        </p>
        <p style="margin: 0; color: #666;">
          📁 → ${escapeHtml(folderPath)}
        </p>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #888;">
          ${driveName}
        </p>
      </div>
      
      <p style="color: #666; font-size: 14px;">
        Wrong folder? Just reply with where it should go.
      </p>
    </div>
  `;
}

function buildAskEmailHtml({
  filename,
  reasoning,
}: {
  filename: string;
  reasoning: string | null;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px;">
      <p>Got a document I'm not sure about:</p>
      
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0;">
          <strong>📄 ${escapeHtml(filename)}</strong>
        </p>
        ${reasoning ? `<p style="margin: 8px 0 0 0; color: #666; font-size: 14px;">${escapeHtml(reasoning)}</p>` : ""}
      </div>
      
      <p><strong>Where should I put it?</strong></p>
      
      <p style="color: #666; font-size: 14px;">
        Reply with a folder path, e.g.:<br>
        • "Receipts/2024"<br>
        • "Projects/Acme Corp/Contracts"<br>
        • "Skip" to ignore this one
      </p>
    </div>
  `;
}

function buildCorrectionConfirmationHtml({
  filename,
  newFolderPath,
}: {
  filename: string;
  newFolderPath: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px;">
      <p>✓ Done! Moved <strong>${escapeHtml(filename)}</strong> to:</p>
      
      <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 0;">
          📁 ${escapeHtml(newFolderPath)}
        </p>
      </div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
