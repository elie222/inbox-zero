import { NextResponse, after } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { validateSlackWebhookRequest } from "@/utils/messaging/providers/slack/verify-signature";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import {
  handleDraftSend,
  handleDraftEdit,
  handleDraftDismiss,
  handleDraftEditSubmit,
} from "@/utils/messaging/providers/slack/draft-actions";
import prisma from "@/utils/prisma";

export const maxDuration = 60;

export const POST = withError("slack/interactions", async (request) => {
  const logger = request.logger;

  if (!env.SLACK_SIGNING_SECRET) {
    return NextResponse.json(
      { error: "Slack not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  const validation = validateSlackWebhookRequest({
    signingSecret: env.SLACK_SIGNING_SECRET,
    timestamp,
    body: rawBody,
    signature,
  });

  if (!validation.valid) {
    logger.warn("Invalid Slack interaction signature", {
      reason: validation.reason,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const payloadStr = params.get("payload");
  if (!payloadStr) {
    return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  }

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    if (!action) {
      return NextResponse.json({ ok: true });
    }

    const messageTs =
      payload.container?.message_ts ?? payload.message?.ts ?? "";
    const channelId =
      payload.container?.channel_id ?? payload.channel?.id ?? "";
    const slackUserId = payload.user?.id;

    // draft_edit must run synchronously — trigger_id expires in 3 seconds
    if (action.action_id === "draft_edit") {
      try {
        const slackClient = await getSlackClientForNotification(messageTs);
        await handleDraftEdit({
          providerMessageId: messageTs,
          triggerId: payload.trigger_id ?? "",
          slackClient,
          slackUserId,
        });
      } catch (error) {
        logger.error("Failed to open edit modal", { error });
      }
      return NextResponse.json({ ok: true });
    }

    // Send and Dismiss can be deferred
    after(async () => {
      try {
        const slackClient = await getSlackClientForNotification(messageTs);

        if (action.action_id === "draft_send") {
          await handleDraftSend({
            providerMessageId: messageTs,
            slackClient,
            channelId,
            slackUserId,
          });
        } else if (action.action_id === "draft_dismiss") {
          await handleDraftDismiss({
            providerMessageId: messageTs,
            slackClient,
            channelId,
            slackUserId,
          });
        }
      } catch (error) {
        logger.error("Failed to handle draft action", {
          error,
          actionId: action.action_id,
        });
      }
    });

    return NextResponse.json({ ok: true });
  }

  if (
    payload.type === "view_submission" &&
    payload.view?.callback_id === "draft_edit_modal"
  ) {
    const providerMessageId = payload.view.private_metadata ?? "";
    const newBody =
      payload.view.state?.values?.draft_body_block?.draft_body?.value ?? "";

    after(async () => {
      try {
        const slackClient =
          await getSlackClientForNotification(providerMessageId);
        await handleDraftEditSubmit({
          providerMessageId,
          newBody,
          slackClient,
        });
      } catch (error) {
        logger.error("Failed to submit edited draft", { error });
      }
    });

    // Return empty response to close the modal
    return NextResponse.json({});
  }

  return NextResponse.json({ ok: true });
});

async function getSlackClientForNotification(providerMessageId: string) {
  const notification = await prisma.pendingDraftNotification.findUnique({
    where: { providerMessageId },
    include: {
      messagingChannel: { select: { accessToken: true } },
    },
  });

  if (!notification?.messagingChannel.accessToken) {
    throw new Error("No Slack access token for notification");
  }

  return createSlackClient(notification.messagingChannel.accessToken);
}

interface SlackInteractionPayload {
  actions?: Array<{ action_id: string; value?: string }>;
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { ts?: string };
  trigger_id?: string;
  type: string;
  user?: { id?: string };
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
