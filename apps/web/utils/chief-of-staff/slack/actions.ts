import { WebClient } from "@slack/web-api";
import type { gmail_v1 } from "@googleapis/gmail";
import type { PrismaClient } from "@/generated/prisma/client";
import { updateSlackMessage } from "./poster";
import { sendDraft, deleteDraft } from "@/utils/gmail/draft";
import { withGmailRetry } from "@/utils/gmail/retry";

// Strip HTML tags for plain text editing in modal
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function buildStatusBlocks(statusText: string) {
  return [
    {
      type: "section" as const,
      text: {
        type: "mrkdwn" as const,
        text: statusText,
      },
    },
  ];
}

export async function handleApprove(params: {
  slackMessageTs: string;
  channelId: string;
  slackAccessToken: string;
  prisma: PrismaClient;
  getGmailClient: (emailAccountId: string) => Promise<gmail_v1.Gmail>;
}): Promise<void> {
  const {
    slackMessageTs,
    channelId,
    slackAccessToken,
    prisma,
    getGmailClient,
  } = params;

  // 1. Look up CosPendingDraft by slackMessageTs
  const draft = await prisma.cosPendingDraft.findUnique({
    where: { slackMessageTs },
  });

  if (!draft) {
    throw new Error(
      `No pending draft found for slackMessageTs: ${slackMessageTs}`,
    );
  }

  // 2. Get Gmail client for the email account
  const gmail = await getGmailClient(draft.emailAccountId);

  // 3. Send the draft via Gmail API
  await sendDraft(gmail, draft.gmailDraftId);

  // 4. Update draft status to "approved"
  await prisma.cosPendingDraft.update({
    where: { slackMessageTs },
    data: { status: "approved" },
  });

  // 5. Update Slack message to show "Sent"
  await updateSlackMessage({
    accessToken: slackAccessToken,
    channelId,
    messageTs: slackMessageTs,
    blocks: buildStatusBlocks("✅ *Sent* — Draft approved and sent."),
    text: "Sent",
  });
}

export async function handleEdit(params: {
  slackMessageTs: string;
  triggerId: string;
  slackAccessToken: string;
  prisma: PrismaClient;
}): Promise<void> {
  const { slackMessageTs, triggerId, slackAccessToken, prisma } = params;

  // 1. Look up CosPendingDraft
  const draft = await prisma.cosPendingDraft.findUnique({
    where: { slackMessageTs },
  });

  if (!draft) {
    throw new Error(
      `No pending draft found for slackMessageTs: ${slackMessageTs}`,
    );
  }

  // 2. Strip HTML for plain-text editing
  const plainTextBody = stripHtml(draft.bodyHtml || "");

  // 3. Open a Slack modal with the draft body in a text area
  const client = new WebClient(slackAccessToken);
  await client.views.open({
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: "cos_edit_modal",
      private_metadata: slackMessageTs,
      title: {
        type: "plain_text",
        text: "Edit Draft",
        emoji: true,
      },
      submit: {
        type: "plain_text",
        text: "Send",
        emoji: true,
      },
      close: {
        type: "plain_text",
        text: "Cancel",
        emoji: true,
      },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*To:* ${draft.toAddress}\n*Subject:* ${draft.subject}`,
          },
        },
        {
          type: "input",
          block_id: "draft_body_block",
          element: {
            type: "plain_text_input",
            action_id: "draft_body",
            multiline: true,
            initial_value: plainTextBody,
          },
          label: {
            type: "plain_text",
            text: "Draft Body",
            emoji: true,
          },
        },
      ],
    },
  });
}

export async function handleEditSubmit(params: {
  slackMessageTs: string;
  newBody: string;
  channelId: string;
  slackAccessToken: string;
  prisma: PrismaClient;
  getGmailClient: (emailAccountId: string) => Promise<gmail_v1.Gmail>;
}): Promise<void> {
  const {
    slackMessageTs,
    newBody,
    channelId,
    slackAccessToken,
    prisma,
    getGmailClient,
  } = params;

  // 1. Look up CosPendingDraft and EmailAccount
  const draft = await prisma.cosPendingDraft.findUnique({
    where: { slackMessageTs },
  });

  if (!draft) {
    throw new Error(
      `No pending draft found for slackMessageTs: ${slackMessageTs}`,
    );
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: draft.emailAccountId },
  });

  if (!emailAccount) {
    throw new Error(`No email account found for id: ${draft.emailAccountId}`);
  }

  // 2. Get Gmail client
  const gmail = await getGmailClient(draft.emailAccountId);

  // 3. Delete old Gmail draft
  await deleteDraft(gmail, draft.gmailDraftId);

  // 4. Build the raw email and create a new draft with edited body
  const newBodyHtml = newBody
    .split("\n")
    .map((line) => (line.trim() === "" ? "<br>" : `<p>${line}</p>`))
    .join("");

  const rawMessage = await buildRawEmail({
    from: emailAccount.email,
    to: draft.toAddress,
    subject: draft.subject,
    bodyHtml: newBodyHtml,
    bodyText: newBody,
    threadId: draft.gmailThreadId,
  });

  const createResult = await withGmailRetry(() =>
    gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          threadId: draft.gmailThreadId,
          raw: rawMessage,
        },
      },
    }),
  );

  const newGmailDraftId = createResult.data.id;
  if (!newGmailDraftId) {
    throw new Error("Failed to create new Gmail draft");
  }

  // 5. Send the new draft
  await sendDraft(gmail, newGmailDraftId);

  // 6. Update status to "edited"
  await prisma.cosPendingDraft.update({
    where: { slackMessageTs },
    data: {
      status: "edited",
      gmailDraftId: newGmailDraftId,
      bodyHtml: newBodyHtml,
    },
  });

  // 7. Update Slack message
  await updateSlackMessage({
    accessToken: slackAccessToken,
    channelId,
    messageTs: slackMessageTs,
    blocks: buildStatusBlocks("✏️ *Edited & Sent* — Draft was edited and sent."),
    text: "Edited & Sent",
  });
}

export async function handleReject(params: {
  slackMessageTs: string;
  channelId: string;
  slackAccessToken: string;
  prisma: PrismaClient;
  getGmailClient: (emailAccountId: string) => Promise<gmail_v1.Gmail>;
}): Promise<void> {
  const {
    slackMessageTs,
    channelId,
    slackAccessToken,
    prisma,
    getGmailClient,
  } = params;

  // 1. Look up CosPendingDraft
  const draft = await prisma.cosPendingDraft.findUnique({
    where: { slackMessageTs },
  });

  if (!draft) {
    throw new Error(
      `No pending draft found for slackMessageTs: ${slackMessageTs}`,
    );
  }

  // 2. Get Gmail client and delete Gmail draft
  const gmail = await getGmailClient(draft.emailAccountId);
  await deleteDraft(gmail, draft.gmailDraftId);

  // 3. Update status to "rejected"
  await prisma.cosPendingDraft.update({
    where: { slackMessageTs },
    data: { status: "rejected" },
  });

  // 4. Update Slack message to show "Skipped"
  await updateSlackMessage({
    accessToken: slackAccessToken,
    channelId,
    messageTs: slackMessageTs,
    blocks: buildStatusBlocks("❌ *Skipped* — Draft was rejected and deleted."),
    text: "Skipped",
  });
}

// Helper to build a base64url-encoded raw email message
async function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  threadId: string;
}): Promise<string> {
  // Use dynamic import to avoid issues with nodemailer in test environments
  const MailComposer = (await import("nodemailer/lib/mail-composer")).default;

  // biome-ignore lint/suspicious/noExplicitAny: MailComposer options type is complex
  const mailOptions: Record<string, unknown> = {
    from: params.from,
    to: params.to,
    subject: params.subject,
    alternatives: [
      {
        contentType: "text/plain; charset=UTF-8",
        content: params.bodyText,
      },
      {
        contentType: "text/html; charset=UTF-8",
        content: params.bodyHtml,
      },
    ],
  };

  // biome-ignore lint/suspicious/noExplicitAny: nodemailer MailComposer constructor type mismatch
  const mailComposer = new MailComposer(
    mailOptions as ConstructorParameters<typeof MailComposer>[0],
  );
  const message = await mailComposer.compile().build();
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
