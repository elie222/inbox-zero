import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import {
  isValidThunderbirdBridgeRequest,
  thunderbirdUnauthorizedResponse,
} from "@/utils/thunderbird/auth";
import {
  clearThunderbirdInbox,
  getThunderbirdInboxItem,
  listThunderbirdInboxItems,
  updateThunderbirdInboxItem,
  enqueueProposedActions,
} from "@/utils/redis/thunderbird-inbox";
import { thunderbirdActionSchema } from "@/utils/redis/thunderbird-actions";

const querySchema = z.object({
  email: z.string().email(),
});

const decideSchema = z.object({
  email: z.string().email(),
  itemId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  proposedActions: z.array(thunderbirdActionSchema).optional(),
});

const clearSchema = z.object({
  email: z.string().email(),
  decision: z.literal("clear"),
});

export const GET = withError("thunderbird/inbox", async (request) => {
  const logger = request.logger.with({ module: "thunderbird-bridge" });

  if (!isValidThunderbirdBridgeRequest(request, logger)) {
    return thunderbirdUnauthorizedResponse();
  }

  const { email } = querySchema.parse({
    email: new URL(request.url).searchParams.get("email"),
  });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true },
  });

  if (!emailAccount) {
    return NextResponse.json({ error: "Email account not found" }, { status: 404 });
  }

  const items = await listThunderbirdInboxItems(emailAccount.id);
  return NextResponse.json({
    emailAccountId: emailAccount.id,
    email: emailAccount.email,
    items,
  });
});

export const POST = withError("thunderbird/inbox/decide", async (request) => {
  const logger = request.logger.with({ module: "thunderbird-bridge" });

  if (!isValidThunderbirdBridgeRequest(request, logger)) {
    return thunderbirdUnauthorizedResponse();
  }

  const json = await request.json();
  const clearBody = clearSchema.safeParse(json);
  if (clearBody.success) {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email: clearBody.data.email.toLowerCase() },
      select: { id: true, email: true },
    });
    if (!emailAccount) {
      return NextResponse.json(
        { error: "Email account not found" },
        { status: 404 },
      );
    }
    const cleared = await clearThunderbirdInbox(emailAccount.id);
    logger.info("Cleared Thunderbird bridge inbox", { cleared });
    return NextResponse.json({ ok: true, cleared });
  }

  const body = decideSchema.parse(json);
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email: body.email.toLowerCase() },
    select: { id: true, email: true },
  });

  if (!emailAccount) {
    return NextResponse.json({ error: "Email account not found" }, { status: 404 });
  }

  const item = await getThunderbirdInboxItem(emailAccount.id, body.itemId);
  if (!item) {
    return NextResponse.json({ error: "Inbox item not found" }, { status: 404 });
  }

  if (item.status !== "pending") {
    return NextResponse.json(
      { error: `Item already ${item.status}` },
      { status: 409 },
    );
  }

  if (body.decision === "reject") {
    const updated = await updateThunderbirdInboxItem(
      emailAccount.id,
      body.itemId,
      { status: "rejected" },
    );
    return NextResponse.json({ ok: true, item: updated });
  }

  const actions = body.proposedActions?.length
    ? body.proposedActions
    : item.proposedActions;

  if (actions.length === 0) {
    const updated = await updateThunderbirdInboxItem(
      emailAccount.id,
      body.itemId,
      { status: "approved", proposedActions: [] },
    );
    return NextResponse.json({
      ok: true,
      item: updated,
      warning: "No actions to apply",
    });
  }

  await enqueueProposedActions(emailAccount.id, actions);
  const updated = await updateThunderbirdInboxItem(emailAccount.id, body.itemId, {
    status: "approved",
    proposedActions: actions,
  });

  logger.info("Approved Thunderbird bridge actions for UI", {
    itemId: body.itemId,
    actionCount: actions.length,
  });

  return NextResponse.json({ ok: true, item: updated, queued: actions.length });
});
