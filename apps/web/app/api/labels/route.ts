import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";

export type UnifiedLabel = {
  id: string;
  name: string;
  type: string | null;
  color?: {
    textColor?: string | null;
    backgroundColor?: string | null;
  };
  labelListVisibility?: string;
  messageListVisibility?: string;
};

export type LabelsResponse = {
  labels: UnifiedLabel[];
};

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

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
  const labels = await emailProvider.getLabels();

  // Map to unified format
  const unifiedLabels: UnifiedLabel[] = (labels || []).map((label) => ({
    id: label.id,
    name: label.name,
    type: label.type,
    color: label.color,
    labelListVisibility: label.labelListVisibility,
    messageListVisibility: label.messageListVisibility,
  }));

  return NextResponse.json({ labels: unifiedLabels });
});
