import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { z } from "zod";

const createLabelBody = z.object({
  name: z.string(),
  description: z.string().nullish(),
});

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const body = await request.json();
  const { name, description } = createLabelBody.parse(body);

  // Get the provider from the related account
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  const provider = emailAccount.account.provider;
  const emailProvider = await createEmailProvider({ emailAccountId, provider });
  const label = await emailProvider.createLabel(
    name,
    description ? description : undefined,
  );

  return NextResponse.json({ label });
});
