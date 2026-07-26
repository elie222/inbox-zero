import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import {
  isValidThunderbirdBridgeRequest,
  thunderbirdUnauthorizedResponse,
} from "@/utils/thunderbird/auth";
import {
  clearThunderbirdActions,
  listThunderbirdActions,
} from "@/utils/redis/thunderbird-actions";

const querySchema = z.object({
  email: z.string().email(),
});

const ackSchema = z.object({
  email: z.string().email(),
  actionIds: z.array(z.string()).optional(),
});

export const GET = withError("thunderbird/actions", async (request) => {
  const logger = request.logger.with({ module: "thunderbird-bridge" });

  if (!isValidThunderbirdBridgeRequest(request, logger)) {
    return thunderbirdUnauthorizedResponse();
  }

  const { email } = querySchema.parse({
    email: new URL(request.url).searchParams.get("email"),
  });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });

  if (!emailAccount) {
    return NextResponse.json({ error: "Email account not found" }, { status: 404 });
  }

  const actions = await listThunderbirdActions(emailAccount.id);
  return NextResponse.json({ emailAccountId: emailAccount.id, actions });
});

export const POST = withError("thunderbird/actions/ack", async (request) => {
  const logger = request.logger.with({ module: "thunderbird-bridge" });

  if (!isValidThunderbirdBridgeRequest(request, logger)) {
    return thunderbirdUnauthorizedResponse();
  }

  const body = ackSchema.parse(await request.json());
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email: body.email.toLowerCase() },
    select: { id: true },
  });

  if (!emailAccount) {
    return NextResponse.json({ error: "Email account not found" }, { status: 404 });
  }

  await clearThunderbirdActions(emailAccount.id, body.actionIds);
  return NextResponse.json({ ok: true });
});
