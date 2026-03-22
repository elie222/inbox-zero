import { NextResponse } from "next/server";
import crypto from "node:crypto";
import prisma from "@/utils/prisma";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { createScopedLogger } from "@/utils/logger";
import {
  handleApprove,
  handleEdit,
  handleEditSubmit,
  handleReject,
} from "@/utils/chief-of-staff/slack/actions";

export const maxDuration = 60;

const logger = createScopedLogger("api/chief-of-staff/slack/interactions");

interface SlackBlockActionsPayload {
  actions?: Array<{ action_id: string }>;
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts?: string };
  trigger_id?: string;
  type: "block_actions";
}

interface SlackViewSubmissionPayload {
  type: "view_submission";
  view?: {
    callback_id?: string;
    private_metadata?: string;
    state?: {
      values?: {
        draft_body_block?: {
          draft_body?: { value?: string };
        };
      };
    };
  };
}

type SlackPayload =
  | SlackBlockActionsPayload
  | SlackViewSubmissionPayload
  | { type: string };

export async function POST(request: Request) {
  const rawBody = await request.text();

  // Verify Slack signing secret
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  if (!verifySlackSignature(signature, timestamp, rawBody)) {
    logger.warn("Invalid Slack signature", { signature, timestamp });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse URL-encoded payload from Slack
  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");

  if (!payloadStr) {
    logger.warn("Missing payload in Slack interaction");
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  let payload: SlackPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackPayload;
  } catch (err) {
    logger.error("Failed to parse Slack payload", { err });
    return NextResponse.json(
      { error: "Invalid payload JSON" },
      { status: 400 },
    );
  }

  try {
    if (payload.type === "block_actions") {
      await handleBlockActions(payload as SlackBlockActionsPayload);
    } else if (
      payload.type === "view_submission" &&
      (payload as SlackViewSubmissionPayload).view?.callback_id ===
        "cos_edit_modal"
    ) {
      await handleViewSubmission(payload as SlackViewSubmissionPayload);
    } else {
      logger.info("Unhandled Slack interaction type", { type: payload.type });
    }
  } catch (err) {
    logger.error("Error handling Slack interaction", {
      err,
      type: payload.type,
    });
    // Return 200 to avoid Slack retries while logging the error
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

async function getSlackTokenForDraft(slackMessageTs: string): Promise<string> {
  // Look up the MessagingChannel via the CosPendingDraft's slackChannelId
  const draft = await prisma.cosPendingDraft.findUnique({
    where: { slackMessageTs },
  });

  if (!draft?.slackChannelId) {
    throw new Error(`No draft or channel found for ts: ${slackMessageTs}`);
  }

  const channel = await prisma.messagingChannel.findFirst({
    where: { channelId: draft.slackChannelId },
  });

  if (!channel?.accessToken) {
    throw new Error(
      `No Slack access token found for channel: ${draft.slackChannelId}`,
    );
  }

  return channel.accessToken;
}

async function getGmailClientForAccount(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    include: { account: true },
  });

  if (!emailAccount?.account) {
    throw new Error(`No email account found for id: ${emailAccountId}`);
  }

  const account = emailAccount.account;

  return getGmailClientWithRefresh({
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    expiresAt: account.expires_at ? Number(account.expires_at) : null,
    emailAccountId,
    logger,
  });
}

async function handleBlockActions(payload: SlackBlockActionsPayload) {
  const actions = payload.actions ?? [];
  const channelId: string =
    payload.container?.channel_id ?? payload.channel?.id ?? "";
  const messageTs: string =
    payload.container?.message_ts ?? payload.message?.ts ?? "";
  const triggerId: string = payload.trigger_id ?? "";

  for (const action of actions) {
    const actionId: string = action.action_id;

    logger.info("Handling block action", { actionId, messageTs, channelId });

    const slackAccessToken = await getSlackTokenForDraft(messageTs);

    if (actionId === "cos_approve") {
      await handleApprove({
        slackMessageTs: messageTs,
        channelId,
        slackAccessToken,
        prisma,
        getGmailClient: getGmailClientForAccount,
      });
    } else if (actionId === "cos_edit") {
      await handleEdit({
        slackMessageTs: messageTs,
        triggerId,
        slackAccessToken,
        prisma,
      });
    } else if (actionId === "cos_reject") {
      await handleReject({
        slackMessageTs: messageTs,
        channelId,
        slackAccessToken,
        prisma,
        getGmailClient: getGmailClientForAccount,
      });
    } else {
      logger.info("Unknown action_id, ignoring", { actionId });
    }
  }
}

async function handleViewSubmission(payload: SlackViewSubmissionPayload) {
  const slackMessageTs: string = payload.view?.private_metadata ?? "";
  const newBody: string =
    payload.view?.state?.values?.draft_body_block?.draft_body?.value ?? "";

  if (!slackMessageTs) {
    throw new Error(
      "Missing slackMessageTs in view submission private_metadata",
    );
  }

  logger.info("Handling edit modal submission", { slackMessageTs });

  const slackAccessToken = await getSlackTokenForDraft(slackMessageTs);

  // Look up the draft to get channelId
  const draft = await prisma.cosPendingDraft.findUnique({
    where: { slackMessageTs },
  });

  if (!draft?.slackChannelId) {
    throw new Error(`No draft found for ts: ${slackMessageTs}`);
  }

  await handleEditSubmit({
    slackMessageTs,
    newBody,
    channelId: draft.slackChannelId,
    slackAccessToken,
    prisma,
    getGmailClient: getGmailClientForAccount,
  });
}

export function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  body: string,
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret || !signature || !timestamp) return false;

  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - Number.parseInt(timestamp, 10)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = `v0=${crypto
    .createHmac("sha256", signingSecret)
    .update(sigBasestring)
    .digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(mySignature),
      Buffer.from(signature),
    );
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return false;
  }
}
